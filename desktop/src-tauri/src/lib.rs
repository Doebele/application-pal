//! Application-Pal Desktop (`d2603`).
//!
//! Die Hülle startet das kompilierte Backend als Sidecar auf einem freien Port an
//! 127.0.0.1, zeigt solange eine Ladeseite und lädt dann das Frontend, das der
//! Sidecar selbst ausliefert (gleiche Origin wie /api → Cookies ohne CORS).
//!
//! Schutz und Lebenszyklus:
//! - Start-Token: zufällig pro Start. Das Fenster öffnet einmal
//!   `/__desktop/enter?token=…`, das setzt ein httpOnly-Cookie; ohne dieses Cookie
//!   lehnt der Sidecar jede Anfrage ab (andere Programme auf dem Mac kommen nicht rein).
//! - Schlüssel für die API-Keys der Profile (`SECRETS_KEY`) liegt im macOS-Schlüsselbund
//!   bzw. in der Windows-Anmeldeinformationsverwaltung, nie auf der Platte.
//! - Der Sidecar hängt an unserer stdin-Pipe: endet die Hülle (auch per Absturz),
//!   schliesst er die Datenbank sauber und beendet sich.
//! - Nur eine Instanz (PGlite verträgt nur einen Prozess pro Datenordner).
//!
//! Daten: `~/Library/Application Support/com.medvesek.d2603/` (pgdata, logs, jwt-secret).

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

// Dienst = App-Kennung (com.medvesek.d2603); Test-Builds mit eigener Kennung bekommen so
// einen eigenen Eintrag statt den der installierten App (und deren Freigabe-Dialog).
const KEYCHAIN_ACCOUNT: &str = "secrets-key";

#[derive(Default)]
struct Sidecar {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
}
struct SidecarState(Mutex<Sidecar>);

fn free_port() -> std::io::Result<u16> {
    Ok(TcpListener::bind("127.0.0.1:0")?.local_addr()?.port())
}

fn random_hex(bytes: usize) -> std::io::Result<String> {
    let mut buf = vec![0u8; bytes];
    getrandom::getrandom(&mut buf).map_err(|e| std::io::Error::other(e.to_string()))?;
    Ok(buf.iter().map(|b| format!("{b:02x}")).collect())
}

/// JWT-Secret einmal erzeugen und im Datenordner behalten, sonst wäre man nach
/// jedem App-Start abgemeldet. (Sitzungen sind weniger heikel als die API-Keys.)
fn jwt_secret(data_dir: &Path) -> std::io::Result<String> {
    let file = data_dir.join("jwt-secret");
    if let Ok(s) = fs::read_to_string(&file) {
        if s.trim().len() >= 32 {
            return Ok(s.trim().to_string());
        }
    }
    let s = random_hex(32)?;
    fs::write(&file, &s)?;
    Ok(s)
}

/// Schlüssel für die verschlüsselten API-Keys aus dem Schlüsselbund; beim ersten
/// Start erzeugen. Ohne Schlüsselbund (sollte nicht vorkommen) bleibt er leer —
/// dann leitet der Sidecar ihn aus dem JWT-Secret ab.
fn secrets_key(service: &str, data_dir: &Path) -> String {
    let entry = match keyring::Entry::new(service, KEYCHAIN_ACCOUNT) {
        Ok(e) => e,
        Err(e) => {
            log_line(data_dir, &format!("Schlüsselbund nicht verfügbar: {e}"));
            return String::new();
        }
    };
    match entry.get_password() {
        Ok(k) if k.len() == 64 => k,
        Ok(_) | Err(keyring::Error::NoEntry) => {
            let k = match random_hex(32) {
                Ok(k) => k,
                Err(_) => return String::new(),
            };
            match entry.set_password(&k) {
                Ok(()) => {
                    log_line(data_dir, "Neuer Schlüssel im Schlüsselbund angelegt");
                    k
                }
                Err(e) => {
                    log_line(data_dir, &format!("Schlüssel konnte nicht gespeichert werden: {e}"));
                    String::new()
                }
            }
        }
        Err(e) => {
            log_line(data_dir, &format!("Schlüsselbund-Zugriff fehlgeschlagen: {e}"));
            String::new()
        }
    }
}

/// Google-Zugang der App (Desktop-OAuth-Client + Picker-Schlüssel). Beim Bauen über
/// `D2603_GOOGLE_CLIENT_ID` usw. eingebettet; `google-client.json` im Datenordner
/// überschreibt das (zum Testen ohne Neubau). Ein Desktop-Client-Secret ist laut
/// Google nicht geheim — Schutz kommt von PKCE und der Loopback-Umleitung.
fn google_env(data_dir: &Path) -> Vec<(&'static str, String)> {
    let file: serde_json::Value = fs::read_to_string(data_dir.join("google-client.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::Value::Null);
    let pick = |key: &str, built: Option<&'static str>| -> String {
        file.get(key)
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .or_else(|| built.map(str::to_string))
            .unwrap_or_default()
    };
    vec![
        ("GOOGLE_CLIENT_ID", pick("clientId", option_env!("D2603_GOOGLE_CLIENT_ID"))),
        ("GOOGLE_CLIENT_SECRET", pick("clientSecret", option_env!("D2603_GOOGLE_CLIENT_SECRET"))),
        ("GOOGLE_API_KEY", pick("apiKey", option_env!("D2603_GOOGLE_API_KEY"))),
        ("GOOGLE_APP_ID", pick("appId", option_env!("D2603_GOOGLE_APP_ID"))),
    ]
}

fn sidecar_path() -> std::io::Result<PathBuf> {
    // Tauri legt externalBin ohne Ziel-Suffix neben die Haupt-Binary (Contents/MacOS/).
    let dir = std::env::current_exe()?
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default();
    let name = if cfg!(windows) { "app-pal-backend.exe" } else { "app-pal-backend" };
    Ok(dir.join(name))
}

fn log_line(data_dir: &Path, msg: &str) {
    eprintln!("[d2603] {msg}");
    if let Ok(mut f) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(data_dir.join("logs").join("desktop.log"))
    {
        let _ = writeln!(f, "{msg}");
    }
}

/// Pipe schliessen → Sidecar schliesst PGlite und beendet sich; nach 5 s hart beenden.
fn stop_sidecar(state: &SidecarState) {
    let mut s = state.0.lock().unwrap();
    drop(s.stdin.take());
    if let Some(mut child) = s.child.take() {
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if let Ok(Some(_)) = child.try_wait() {
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// Beim Start im Hintergrund nach einem Update suchen (GitHub Release `desktop-updater`,
/// Datei `latest.json`, signiert mit dem Updater-Schlüssel). Gibt es eines, fragt ein
/// nativer Dialog; nach dem Herunterladen wird erst der Sidecar beendet (unter Windows
/// muss der Installer dessen .exe ersetzen können), dann installiert und neu gestartet.
/// `D2603_UPDATE_URL` ersetzt die Adresse (lokaler Test).
fn check_for_update(app: AppHandle, data_dir: PathBuf) {
    tauri::async_runtime::spawn(async move {
        let mut builder = app.updater_builder();
        if let Some(url) = std::env::var("D2603_UPDATE_URL").ok().and_then(|u| u.parse().ok()) {
            builder = match builder.endpoints(vec![url]) {
                Ok(b) => b,
                Err(e) => return log_line(&data_dir, &format!("Update-Adresse ungültig: {e}")),
            };
        }
        let update = match builder.build() {
            Ok(updater) => match updater.check().await {
                Ok(Some(update)) => update,
                Ok(None) => return log_line(&data_dir, "Kein Update verfügbar"),
                Err(e) => return log_line(&data_dir, &format!("Update-Prüfung fehlgeschlagen: {e}")),
            },
            Err(e) => return log_line(&data_dir, &format!("Updater nicht verfügbar: {e}")),
        };
        log_line(&data_dir, &format!("Update {} gefunden (installiert {})", update.version, update.current_version));

        let notes = update.body.clone().unwrap_or_default();
        let text = format!(
            "Application-Pal {} ist verfügbar (installiert: {}).\n\n{}\n\nJetzt aktualisieren? Die App startet danach neu – deine Daten bleiben erhalten.",
            update.version, update.current_version, notes.trim()
        );
        let handle = app.clone();
        app.dialog()
            .message(text)
            .title("Update verfügbar")
            .kind(MessageDialogKind::Info)
            .buttons(MessageDialogButtons::OkCancelCustom("Aktualisieren".into(), "Später".into()))
            .show(move |yes| {
                if !yes {
                    return log_line(&data_dir, "Update auf später verschoben");
                }
                tauri::async_runtime::spawn(async move {
                    let bytes = match update.download(|_, _| {}, || {}).await {
                        Ok(b) => b,
                        Err(e) => {
                            log_line(&data_dir, &format!("Update-Download fehlgeschlagen: {e}"));
                            handle.dialog().message(format!("Das Update konnte nicht geladen werden:\n{e}"))
                                .title("Update").kind(MessageDialogKind::Error).show(|_| {});
                            return;
                        }
                    };
                    stop_sidecar(&handle.state::<SidecarState>());
                    if let Err(e) = update.install(bytes) {
                        log_line(&data_dir, &format!("Update-Installation fehlgeschlagen: {e}"));
                    } else {
                        log_line(&data_dir, &format!("Update {} installiert, Neustart", update.version));
                    }
                    // Auch nach einem Fehler neu starten: der Sidecar ist schon beendet.
                    handle.restart();
                });
            });
    });
}

pub fn run() {
    let t0 = Instant::now();
    let app = tauri::Builder::default()
        // Zweiter Start: vorhandenes Fenster nach vorne holen statt einen zweiten Sidecar zu starten.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarState(Mutex::new(Sidecar::default())))
        .setup(move |app| {
            let data_dir = app.path().app_data_dir()?;
            let res_dir = app.path().resource_dir()?;
            fs::create_dir_all(data_dir.join("logs"))?;
            fs::create_dir_all(data_dir.join("knowledge-base"))?;

            let port = free_port()?;
            let token = random_hex(24)?;
            let log = File::create(data_dir.join("logs").join("backend.log"))?;
            let mut child = Command::new(sidecar_path()?)
                .env("APP_MODE", "desktop")
                .env("DB_DRIVER", "pglite")
                .env("PGLITE_DATA_DIR", data_dir.join("pgdata"))
                .env("PGLITE_ASSETS_DIR", res_dir.join("pglite"))
                .env("MIGRATIONS_DIR", res_dir.join("migrations"))
                .env("STATIC_DIR", res_dir.join("frontend"))
                .env("KB_BASE_PATH", data_dir.join("knowledge-base"))
                .env("JWT_SECRET", jwt_secret(&data_dir)?)
                .env("SECRETS_KEY", secrets_key(&app.config().identifier, &data_dir))
                .env("DESKTOP_TOKEN", &token)
                .env("DESKTOP_PARENT_PIPE", "1")
                .env("HOST", "127.0.0.1")
                .env("PORT", port.to_string())
                .env("APP_URL", format!("http://127.0.0.1:{port}"))
                .stdout(log.try_clone()?)
                .stderr(log)
                .envs(google_env(&data_dir))
                .stdin(Stdio::piped())
                .spawn()?;
            log_line(&data_dir, &format!("Sidecar gestartet (pid {}, Port {port})", child.id()));
            {
                let state = app.state::<SidecarState>();
                let mut s = state.0.lock().unwrap();
                s.stdin = child.stdin.take();
                s.child = Some(child);
            }

            // Warten, bis der Sidecar lauscht (er öffnet den Port erst nach DB-Init und
            // Migration), dann die Ladeseite per location.replace ersetzen — so bleibt sie
            // nicht im Verlauf, und „Zurück“ (z.B. Backspace) führt nicht mehr dorthin.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let addr: SocketAddr = ([127, 0, 0, 1], port).into();
                let deadline = Instant::now() + Duration::from_secs(60);
                while Instant::now() < deadline {
                    if TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok() {
                        log_line(
                            &data_dir,
                            &format!("Backend bereit nach {} ms seit App-Start", t0.elapsed().as_millis()),
                        );
                        if let Some(win) = handle.get_webview_window("main") {
                            let url = format!("http://127.0.0.1:{port}/__desktop/enter?token={token}");
                            let _ = win.eval(format!("window.location.replace({url:?})"));
                        }
                        check_for_update(handle.clone(), data_dir.clone());
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(50));
                }
                log_line(&data_dir, "Backend nach 60 s nicht erreichbar — siehe logs/backend.log");
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Tauri-App konnte nicht gebaut werden");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            stop_sidecar(&handle.state::<SidecarState>());
        }
    });
}

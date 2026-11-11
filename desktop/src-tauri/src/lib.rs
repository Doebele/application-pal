//! Application-Pal Desktop — M0-Spike.
//!
//! Die Hülle startet das kompilierte Node-/Bun-Backend als Sidecar auf einem freien
//! Port an 127.0.0.1, zeigt solange eine Ladeseite und lädt dann das Frontend, das
//! der Sidecar selbst ausliefert (gleiche Origin wie /api → Cookies ohne CORS).
//! Daten (PGlite, Logs, JWT-Secret) liegen im App-Datenordner
//! `~/Library/Application Support/com.medvesek.d2603/`.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, Url};

struct Sidecar(Mutex<Option<Child>>);

fn free_port() -> std::io::Result<u16> {
    Ok(TcpListener::bind("127.0.0.1:0")?.local_addr()?.port())
}

/// JWT-Secret einmal erzeugen und im Datenordner behalten, sonst wäre man nach
/// jedem App-Start abgemeldet.
fn jwt_secret(data_dir: &Path) -> std::io::Result<String> {
    let file = data_dir.join("jwt-secret");
    if let Ok(s) = fs::read_to_string(&file) {
        if s.trim().len() >= 32 {
            return Ok(s.trim().to_string());
        }
    }
    let mut buf = [0u8; 32];
    getrandom::getrandom(&mut buf).map_err(|e| std::io::Error::other(e.to_string()))?;
    let s: String = buf.iter().map(|b| format!("{b:02x}")).collect();
    fs::write(&file, &s)?;
    Ok(s)
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

pub fn run() {
    let t0 = Instant::now();
    let app = tauri::Builder::default()
        .manage(Sidecar(Mutex::new(None)))
        .setup(move |app| {
            let data_dir = app.path().app_data_dir()?;
            let res_dir = app.path().resource_dir()?;
            fs::create_dir_all(data_dir.join("logs"))?;
            fs::create_dir_all(data_dir.join("knowledge-base"))?;

            let port = free_port()?;
            let log = File::create(data_dir.join("logs").join("backend.log"))?;
            let child = Command::new(sidecar_path()?)
                .env("DB_DRIVER", "pglite")
                .env("PGLITE_DATA_DIR", data_dir.join("pgdata"))
                .env("PGLITE_ASSETS_DIR", res_dir.join("pglite"))
                .env("MIGRATIONS_DIR", res_dir.join("migrations"))
                .env("STATIC_DIR", res_dir.join("frontend"))
                .env("KB_BASE_PATH", data_dir.join("knowledge-base"))
                .env("JWT_SECRET", jwt_secret(&data_dir)?)
                .env("HOST", "127.0.0.1")
                .env("PORT", port.to_string())
                .env("APP_URL", format!("http://127.0.0.1:{port}"))
                .stdout(log.try_clone()?)
                .stderr(log)
                .stdin(Stdio::null())
                .spawn()?;
            log_line(&data_dir, &format!("Sidecar gestartet (pid {}, Port {port})", child.id()));
            *app.state::<Sidecar>().0.lock().unwrap() = Some(child);

            // Warten, bis der Sidecar lauscht (er öffnet den Port erst nach DB-Init
            // und Migration), dann das Fenster vom Ladebildschirm umleiten.
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
                            let url: Url = format!("http://127.0.0.1:{port}/").parse().unwrap();
                            let _ = win.navigate(url);
                        }
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
            if let Some(mut child) = handle.state::<Sidecar>().0.lock().unwrap().take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    });
}

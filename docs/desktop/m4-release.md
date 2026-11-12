# M4: Signierung, Updater, CI

Stand: 11.11.2026 · Branch `desktop`

## Was gebaut wurde

| Teil | Wo |
|---|---|
| Update-Prüfung beim Start, nativer Dialog „Aktualisieren / Später“, Download → Sidecar beenden → installieren → Neustart | `check_for_update()` in `desktop/src-tauri/src/lib.rs` (`tauri-plugin-updater`, `tauri-plugin-dialog`) |
| Update-Adresse | `https://github.com/Doebele/application-pal/releases/download/desktop-updater/latest.json` (`plugins.updater` in `tauri.conf.json`), zum Testen überschreibbar mit `D2603_UPDATE_URL` |
| Öffentlicher Updater-Schlüssel | `plugins.updater.pubkey` in `tauri.conf.json` |
| Updater-Artefakte nur im Release-Build | `desktop/src-tauri/tauri.release.conf.json` (`createUpdaterArtifacts`), damit lokale Builds ohne privaten Schlüssel funktionieren |
| Hardened Runtime + Entitlements (für Notarisierung) | `bundle.macOS` in `tauri.conf.json`, `desktop/src-tauri/sidecar.entitlements` |
| Windows-Installer (NSIS, pro Benutzer, DE/EN/FR) | `bundle.windows.nsis` |
| Build-Skript für weitere Ziele | `TARGET_TRIPLE=x86_64-apple-darwin` bzw. `x86_64-pc-windows-msvc` in `desktop/scripts/build-sidecar.sh` |
| CI: Mac (Apple Silicon + Intel) und Windows, Release-Entwurf | `.github/workflows/desktop-release.yml` (Tag `desktop-vX.Y.Z`) |
| `latest.json` erst nach dem Veröffentlichen ausliefern | `.github/workflows/desktop-updater.yml` |
| Schlüsselbund-Dienst = App-Kennung | `secrets_key()` (Test-Builds mit anderer Kennung teilen sich den Eintrag nicht mehr) |

### Release-Ablauf

1. Version in `desktop/src-tauri/tauri.conf.json` erhöhen (auch `Cargo.toml` und `desktop/package.json`).
2. Tag `desktop-v0.2.0` pushen → `Desktop Release` baut drei Pakete, signiert/notarisiert den Mac-Teil und legt einen **Entwurf** an. Der Tag muss zur Version passen, sonst bricht der Build ab.
3. Entwurf auf GitHub prüfen und **veröffentlichen** → `Desktop Updater` legt dessen `latest.json` in den festen Release `desktop-updater`. Ab dann bieten installierte Apps das Update an.

Desktop-Tags heissen bewusst `desktop-v*`: `docker.yml` baut bei jedem `v*`-Tag die Docker-Images.

## Befunde

- **Hardened Runtime braucht drei Entitlements.** Ohne `disable-library-validation` lädt der Sidecar das eingebettete `@napi-rs/canvas` nicht und stürzt beim Start ab („Failed to load native binding“); ohne `allow-jit` + `allow-unsigned-executable-memory` dasselbe. Mit allen drei läuft er (geprüft ad-hoc signiert mit `--options runtime`). Tauri gibt die Entitlements an Hülle **und** Sidecar weiter.
- **XML-Kommentare in der Entitlements-Datei dürfen kein `--` enthalten**, sonst bricht `codesign` mit „AMFIUnserializeXML: syntax error“ ab.
- **Quer-Kompilieren für Intel-Macs**: npm installiert `@napi-rs/canvas` nur für den eigenen Prozessor; ohne die x64-Variante bettet bun nichts ein und der Sidecar startet nicht. Das Build-Skript lädt die passende Variante (gleiche Version) jetzt selbst nach. Das x64-Binary wird dadurch 29 MB grösser (eingebettet). Starten liess es sich hier nicht (kein Rosetta installiert) → erster echter Test in der CI bzw. auf einem Intel-Mac.
- **Der Updater akzeptiert nur HTTPS.** Für lokale Tests braucht der alte Build `plugins.updater.dangerousInsecureTransportProtocol: true` – nie im Release.
- **Schlüsselbund-Freigabe nach Signaturwechsel**: Eine anders signierte App fragt beim ersten Zugriff auf den Schlüsselbund-Eintrag nach (Start dauerte 11–20 s, bis die Freigabe bestätigt war). Mit stabiler Developer-ID-Signatur (gleiches Team) bleibt die Freigabe über Updates erhalten; zwischen ad-hoc-/Development- und Developer-ID-Builds fragt macOS einmal.

## Getestet (lokal, macOS arm64)

- Build 0.1.0 ad-hoc signiert mit Hardened Runtime; beide Binaries tragen die drei Entitlements und `flags=runtime`.
- Update-Paket 0.1.1 mit `tauri.release.conf.json` und dem Updater-Schlüssel gebaut (`.app.tar.gz` + `.sig`).
- Ablauf über einen lokalen Server: 0.1.0 findet 0.1.1 → Dialog → „Aktualisieren“ → installiert → Neustart → `CFBundleShortVersionString` 0.1.1, alter Sidecar beendet, neuer läuft.
- Beenden der Hülle per SIGTERM → Sidecar meldet „parent pipe closed“ und beendet sich.
- Workflows: YAML gültig. **Nicht gelaufen** – braucht einen Push und die Secrets.

Nicht getestet: echte Developer-ID-Signatur und Notarisierung, Windows (Build und Installer), Intel-Sidecar.

## Was Claus einrichten muss

### 1. Updater-Schlüssel (erledigt bis auf Ablage)

Erzeugt am 11.11.2026: `~/.tauri/d2603-updater.key` (privat, ohne Passwort) und `~/.tauri/d2603-updater.key.pub` (steht in `tauri.conf.json`).
- Privaten Schlüssel in den Passwortmanager (Enpass) **und** als GitHub-Secret `TAURI_SIGNING_PRIVATE_KEY` (Dateiinhalt). `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` leer anlegen.
- **Geht der Schlüssel verloren, können installierte Apps keine Updates mehr annehmen** – sie müssten neu installiert werden.

### 2. Apple (Konto Kafka-Locker)

1. Zertifikat **„Developer ID Application“** erstellen (developer.apple.com → Certificates; nur der Account Holder darf das). Lokal gibt es bisher nur „Apple Development“-Zertifikate, die für die Verteilung nicht reichen.
2. Mit privatem Schlüssel als `.p12` exportieren → `base64 -i cert.p12 | pbcopy` → Secret `APPLE_CERTIFICATE`; Exportpasswort → `APPLE_CERTIFICATE_PASSWORD`.
3. `APPLE_SIGNING_IDENTITY` = voller Name, z.B. `Developer ID Application: Kafka-Locker GmbH (TEAMID)`.
4. App-Store-Connect-API-Schlüssel (Users and Access → Integrations → Team Keys, Rolle „Developer“): `.p8`-Inhalt → `APPLE_API_PRIVATE_KEY`, Key-ID → `APPLE_API_KEY`, Issuer-ID → `APPLE_API_ISSUER`.

Ohne Zertifikat baut die CI eine unsignierte Mac-App (Warnung im Log); ohne API-Schlüssel signiert, aber nicht notarisiert.

### 3. Google (aus M2)

`D2603_GOOGLE_CLIENT_ID`, `D2603_GOOGLE_CLIENT_SECRET`, `D2603_GOOGLE_API_KEY`, `D2603_GOOGLE_APP_ID` als Secrets – werden beim Bauen eingebettet.

### 4. Windows-Signierung (offen)

Ohne Signatur zeigt Windows SmartScreen beim Installieren eine Warnung („Unbekannter Herausgeber“), die App läuft trotzdem. Optionen:
- **Azure Trusted Signing** (ca. 10 USD/Monat, kein Hardware-Token, in CI einfach; braucht Firmen- oder Einzelperson-Validierung bei Microsoft).
- Klassisches OV/EV-Zertifikat (Hardware-Token oder Cloud-HSM, teurer).

Sobald entschieden: `bundle.windows.signCommand` in `tauri.conf.json` + Secrets ergänzen.

## Nachtrag: Update-Knopf, Systemsprache, Export/Import

- **Systemsprache**: Die Hülle liest die bevorzugte Sprache des Betriebssystems (`sys-locale`) und reduziert sie auf `de`/`en`/`fr`, jede andere wird `en`. Sie geht als `OS_LANG` an den Sidecar. `GET /api/auth/status` liefert sie als `osLang`: Der Anmeldebildschirm (Profilauswahl) zeigt diese Sprache, und neue Profile starten mit ihr (`user_profile.ui_language`). Nach dem Anmelden gilt die Sprache des Profils.
- **Update-Dialog** in Systemsprache (beim Start) bzw. in der UI-Sprache des Profils (Knopf).
- **„Nach Updates suchen“**: Einstellungen → Profil & Schutz, nur in der Desktop-App. Zeigt die installierte Version, ruft den Hüllen-Befehl `check_update` auf (`frontend/src/lib/desktopShell.ts`). Die Capability `sidecar-page` erlaubt der Seite von `http://127.0.0.1:*` nur die App-eigenen Befehle (`check_update`, `app_version`), keine Plugin-Rechte. Während einer Prüfung oder eines offenen Dialogs antwortet ein zweiter Klick mit `busy`.
- **Export/Import Web ↔ Desktop**: gleiches Format (`meta.version 1`), beide Richtungen mit dem Web-Export vom 11.11.2026 getestet (33 Bewerbungen, 133 Aktivitäten, 17 Dokumente, 5 CV- und 6 LinkedIn-Versionen), alle Felder identisch. Dabei behoben:
  - Dieselbe Datei in ein **zweites Profil** (oder zweites Web-Konto) importiert, hängte die Zeilen des ersten Profils um, statt sie zu kopieren (Upsert über die Zeilen-ID). Jetzt bekommen Zeilen, deren ID einem anderen Nutzer gehört, eine aus Nutzer + alter ID **abgeleitete** neue ID; Verweise (`applicationId`, `userDocumentId`, `parentId`, `sourceDocumentId`) folgen. Erneutes Importieren ins selbe Profil aktualisiert weiterhin, statt zu verdoppeln.
  - Das Profil-Datenblatt wird über `user_id` zugeordnet, nicht über die exportierte Zeilen-ID.
  - CV- und LinkedIn-Versionen verloren beim Import die Millisekunden ihres Zeitstempels.
- **Download in der Desktop-App**: WKWebView bricht Downloads ohne Handler ab – „Daten exportieren“ tat dort nichts. Die Hülle baut das Fenster jetzt selbst (`"create": false`) mit `on_download`; Ziel ist der Ordner Downloads, die Einstellungen sagen, wohin die Datei ging.

## Externe Links

Links mit `target="_blank"` (Original-Stellenanzeige, Drive-Ordner, Schlüssel-Seiten der KI-Anbieter …) öffnete das App-Fenster nicht: WKWebView braucht dafür einen Handler. Die Hülle setzt `on_new_window` und gibt http(s)- und mailto-Links an den Standardbrowser (`open_external`, macOS `open`, Windows `rundll32 url.dll,FileProtocolHandler`). Ein `on_navigation`-Filter wäre riskant: wry ruft ihn auch für iframes auf (Google Picker).

## Produktname Apply-Pal

Die Desktop-App heisst **Apply-Pal** (`productName`, Fenstertitel, Ladeseite, Update-Dialog, Release-Name). So heisst auch die App im Google-Cloud-Projekt `apply-pal-d2603`; Google prüft, dass der Name in App, Website und Zustimmungsbildschirm übereinstimmt. Die Web-/Docker-Version bleibt Application-Pal: Das Frontend wählt den Namen über `hasShell()` (`frontend/src/lib/appName.ts`, in Übersetzungen `{{app}}`), das Backend über `APP_MODE`. Die Kennung `com.medvesek.d2603` bleibt – sonst wären Datenordner und Schlüsselbund-Eintrag weg.

## App-Icon

Vorlage: Figma „macOS Preview“ (Knoten 87:2041, Rahmen „AppIcon-macOS“, 1024 px, Squircle 824 px mit Schatten). Die Quelle liegt transparent in `desktop/app-icon.png`; alle Grössen (`icns`, `ico`, Windows-Store-Logos) erzeugt aus `desktop/`:

```bash
npx tauri icon app-icon.png -o src-tauri/icons && rm -rf src-tauri/icons/android src-tauri/icons/ios
```

Der Figma-Export hat einen grauen Hintergrund; für `app-icon.png` wurde er entfernt (Schatten als schwarze Transparenz, Kanten entmischt).

## Offen

- Fehlermeldungen des Servers bei der Anmeldung („Falsche PIN“) sind noch deutsch.
- Universal-Binary statt zwei Mac-Paketen wäre möglich (`lipo` auf beide Sidecars), spart den Download-Entscheid für Nutzer.
- Testdaten des lokalen Tests: `~/Library/Application Support/com.medvesek.d2603.test/` kann gelöscht werden.

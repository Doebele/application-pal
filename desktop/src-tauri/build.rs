fn main() {
    // App-eigene Befehle als Berechtigungen anmelden (allow-check-update, allow-app-version).
    // Ohne das lehnt Tauri sie für die Seite vom Sidecar (http://127.0.0.1:<Port>) ab:
    // „Command check_update not allowed by ACL“. Freigegeben in capabilities/sidecar-page.json.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["check_update", "app_version"])),
    )
    .expect("tauri-build fehlgeschlagen");
}

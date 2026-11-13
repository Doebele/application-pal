# Projekt-Brief: Application-Pal Desktop (`d2603`)

Stand: 11.11.2026 · Projektcode `d2603` (vorgeschlagen, noch nicht im Register eingetragen)

## Worum es geht

Application-Pal läuft heute als Web-App in Docker (Postgres + Hono-Backend + React-Frontend hinter nginx). Ziel ist eine installierbare **Mac- und Windows-App**, die Familien ohne Docker und ohne technisches Wissen einrichten können. Die Web/Docker-Version bleibt bestehen und wird weiter entwickelt.

## Aktueller Stand

- Nur Planung, noch kein Code.
- Grösse der bestehenden App: Backend ~11'500 Zeilen TS (164 Routen in `backend/src/index.ts`), Frontend ~19'300 Zeilen React, `shared` ~600 Zeilen, 19 Tabellen.
- Im Schema und Backend kein `jsonb` und kein rohes `sql\``, was den DB-Wechsel erleichtert.

## Was bereits entschieden ist

1. **Kein Rust-Rewrite zu Beginn.** Tauri-Hülle + bestehendes Node-Backend als Sidecar (eine kompilierte Datei). Einzelne Teile werden nur bei messbarem Grund nach Rust portiert.
2. **Gleiches Repository, eigener Langzeit-Branch `desktop` in eigenem Worktree.** Kein Fork: Frontend, Backend und `shared` werden geteilt, sonst müsste jedes Feature doppelt gebaut werden. Desktop-Hülle als eigener Workspace `desktop/` (Vorbild: `freelance-pal/apps/desktop`). Änderungen, die auch der Web-Version nützen (DB-Treiber-Schicht, Nutzer-Einstellungen in der DB), gehen in kleinen PRs nach `main`.
3. **Mehrbenutzer bleibt.** Mehrere Profile auf einem Rechner (Familien: Kinder als Schulabgänger oder Berufseinsteiger). Profilauswahl beim Start, optional Passwort oder PIN. Passkeys fallen auf dem Desktop weg.
4. **Integrationen richtet jeder Nutzer selbst ein:** Google Drive, LinkedIn, lokale KI (LM Studio/Ollama) oder Cloud-Modell.
5. **Eingebettete Datenbank:** zuerst **PGlite** (`drizzle-orm/pglite`) testen, damit der Postgres-Dialekt bleibt. Fallback SQLite.
6. **Verteilung:** macOS mit Developer ID + Notarisierung über das bestehende Apple-Developer-Konto (Kafka-Locker), **ausserhalb** des Mac App Store. Windows braucht ein eigenes Code-Signing-Zertifikat.
7. **App-Kennung** nach dem Projektcode-Schema (Vault: *03 Bereiche → Projektcodes*): `com.medvesek.d2603`, App-Daten unter `~/Library/Application Support/com.medvesek.d2603/`. Eine spätere Web-Variante hiesse `w2603`. Name nie in der Kennung.

## Bekannte Stolpersteine im bestehenden Code

- **KI-Konfiguration inkl. API-Keys liegt im `localStorage`** (Zustand-Store `app-pal-ui-v2`). In der Desktop-App wäre sie für alle Profile gemeinsam. Sie muss pro Nutzer in die DB, API-Keys in den Schlüsselbund (Keychain / Windows Credential Manager). Gleiches gilt für Drive-Benennungsregeln und Tabellenlayout.
- **Gemeinsamer Google-Token** (`google_oauth_tokens.user_id IS NULL`, Fallback in `getDriveAccessToken`) muss weg, sonst schreibt ein Profil in das Drive eines anderen.
- **Google-Scope `drive` ist „restricted“.** Zum Verteilen braucht es Googles Sicherheitsprüfung. Plan: ein mitgelieferter Desktop-OAuth-Client, Umstellung auf `drive.file` + Google Picker (Vorlagen und Ordner wählt der Nutzer einmal aus).
- **OAuth-Callbacks** (Google, LinkedIn) brauchen den Loopback-Flow auf `127.0.0.1` mit PKCE. LinkedIn verlangt einen fest registrierten Port.
- **`resolveHostUrl()`** (Docker-Umweg für `localhost`) wird überflüssig.
- **Zwei Engines:** Mac WKWebView (Safari), Windows WebView2 (Chromium). Testen: Sticky-Tabelle, natives Drag & Drop, `copyText()`, pdf.js-Worker (`.mjs`).
- **Lokaler HTTP-Server** des Sidecars nur auf `127.0.0.1` binden und mit einem Start-Token absichern.
- **Docker-Fallstrick (CLAUDE.md):** Docker immer aus dem Haupt-Checkout bauen, nie aus dem Desktop-Worktree.

## Welche Dateien geändert wurden

- `docs/desktop/project-brief.md` (dieses Dokument, neu)
- Memory: `project_desktop_app.md` (Claude-Projektgedächtnis)

## Nächste Aufgabe für den Agenten

**Meilenstein M0: Machbarkeits-Spike, kein Produktionscode.**

1. Branch `desktop` anlegen, in eigenem Worktree arbeiten.
2. PGlite als Treiber hinter einer schmalen DB-Schicht testen: Schema aus `shared/src/schema.ts` per `drizzle-kit push` in PGlite, Backend damit starten, einen JSON-Export der Docker-Instanz importieren (`/api/import`).
3. Minimale Tauri-App in `desktop/` (Kennung `com.medvesek.d2603`), die das Node-Backend als Sidecar startet und das gebaute Frontend lädt.
4. Ergebnis als Kurzbericht in `docs/desktop/m0-spike.md`: was lief, was nicht, Grösse der App, Startzeit, Entscheidung PGlite vs. SQLite.

Danach (nicht in M0): M1 Profile + Nutzer-Einstellungen aus `localStorage` in DB/Schlüsselbund · M2 Google `drive.file` + Picker, Loopback-OAuth · M3 Einrichtungsassistent (KI, Google, LinkedIn) · M4 Signierung, Updater, CI für Mac und Windows.

## Offene Fragen

- Code `d2603` ist noch nicht im Vault-Register eingetragen. Laut Regel vor der ersten Nutzung eintragen.
- Anzeigename der Desktop-App (vorerst „Application-Pal“).
- Windows-Signierung: welcher Anbieter, wer hält das Zertifikat.
- Soll die Docker/Web-Version langfristig parallel weiterlaufen oder irgendwann in der Desktop-App aufgehen? (Annahme: parallel.)
- Sync zwischen Geräten: bewusst nicht im Umfang (Annahme).

## Übergabe an anderes Modell / anderes Tool

- Zuerst `CLAUDE.md` im Repo lesen: Sie beschreibt Architektur, Fallstricke und viele „don't fix“-Regeln, die 1:1 erhalten bleiben müssen.
- Antworten und Doku auf Deutsch, Schweizer Schreibweise (ss statt ß).
- Keine Commits auf `main` ohne Rückfrage, keine Pushes ohne Auftrag.
- Self-Checks (`npx tsx backend/src/*.check.ts`) nach jeder Änderung an Regel-Code laufen lassen.

## Copy-Paste-Kurzbriefing

> Application-Pal (Bewerbungs-App, heute Docker: Postgres + Hono + React) soll eine Mac- und Windows-App werden (Projektcode `d2603`, Kennung `com.medvesek.d2603`). Entschieden: kein Rust-Rewrite, sondern Tauri-Hülle + bestehendes Node-Backend als Sidecar; gleiches Repo, Branch `desktop`, Workspace `desktop/`; Mehrbenutzer mit Profilen bleibt (Familien); Google, LinkedIn und KI richtet jeder Nutzer selbst ein; DB zuerst PGlite testen, sonst SQLite; macOS-Verteilung über das Apple-Konto von Kafka-Locker ausserhalb des App Store. Nächster Schritt M0-Spike: PGlite + minimale Tauri-App mit Sidecar, Bericht in `docs/desktop/m0-spike.md`. Details: `docs/desktop/project-brief.md` und `CLAUDE.md`.

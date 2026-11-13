# M0-Spike: Application-Pal Desktop (`d2603`)

Stand: 11.11.2026 · Branch `claude/fervent-greider-e2e90e` · nur macOS (Apple Silicon) gebaut

**Ergebnis:** Machbar. Die Tauri-App startet, das kompilierte Backend läuft als Sidecar mit eingebettetem PGlite, ein JSON-Export der Docker-Instanz lässt sich importieren und das Board zeigt die Daten. **Empfehlung: PGlite behalten, SQLite nicht weiter verfolgen.**

## Was gebaut wurde

| Teil | Datei(en) | Zweck |
|---|---|---|
| DB-Schicht | `backend/src/db.ts`, `backend/src/env.ts` | `DB_DRIVER=postgres` (Default, Docker unverändert) oder `pglite`. PGlite-Daten in `PGLITE_DATA_DIR` (leer = im Speicher), Schema per drizzle-Migration aus `MIGRATIONS_DIR` beim Start. Nach aussen bleibt `db` vom Typ `NodePgDatabase` – keine Änderung an den 164 Routen nötig. |
| Schema für PGlite | `backend/drizzle-pglite/`, `backend/drizzle.pglite.config.ts` | Vollständige Migration (19 Tabellen) aus `shared/src/schema.ts` per `drizzle-kit generate`. Die alten `backend/drizzle/`-Migrationen sind unvollständig (Docker-DB wurde mit `push` + `ALTER TABLE` gepflegt) und taugen nicht als Basis. |
| Statische Auslieferung | `backend/src/index.ts` (Block vor `serve()`) | Mit `STATIC_DIR` liefert das Backend das gebaute Frontend selbst aus (SPA-Fallback, `.mjs` als JavaScript). Frontend und `/api` laufen auf derselben Origin → Cookies ohne CORS, kein nginx. |
| Bind-Adresse | `HOST` in `env.ts` | Docker weiter `0.0.0.0`, Sidecar `127.0.0.1`. |
| Native Module | `backend/src/sidecar-polyfill.ts`, `bcrypt` → `bcryptjs` | siehe „Stolpersteine“ |
| Desktop-Hülle | `desktop/` | Tauri 2, Kennung `com.medvesek.d2603`, Rust-Crate `d2603`. Startet den Sidecar auf freiem Port an 127.0.0.1, zeigt eine Ladeseite und navigiert, sobald der Port offen ist. Daten, Logs und ein persistentes JWT-Secret unter `~/Library/Application Support/com.medvesek.d2603/`. |
| Build | `desktop/scripts/build-sidecar.sh`, `npm run build` in `desktop/` | Shared + Frontend (nur `vite build`) + `bun build --compile` + PGlite-Assets → `npx tauri build` |

Bauen und starten:

```bash
cd desktop && npm install && npm run build
open src-tauri/target/release/bundle/macos/Application-Pal.app
```

## Was lief

- **PGlite mit dem bestehenden Code:** Backend startet mit `DB_DRIVER=pglite`, Login/Registrierung, Board, Detailansicht, Stage-Wechsel inkl. automatischer Tasks, Kalender-Events, Archiv, Export, LinkedIn-State, CV-Versionen, Invites antworten korrekt. `ilike`, `onConflictDoUpdate`, `returning`, `gen_random_uuid()` funktionieren unverändert.
- **Import** des Exports `application-pal-export-2026-05-14.json`: 5 Bewerbungen, 7 Aktivitäten, 1 Kontakt, 4 Dokumente, Profil – sowohl unter `tsx` als auch im kompilierten Sidecar in der App.
- **Persistenz:** Daten und Sitzung überleben einen App-Neustart (JWT-Secret wird im Datenordner abgelegt).
- **Postgres-Betrieb** gegen die laufende Docker-DB (nur lesend getestet: `/api/auth/status`, `/api/auth/users`) und Node-Build (`tsc` → `node dist/index.js`) funktionieren weiter. Docker selbst wurde bewusst nicht aus dem Worktree gebaut.
- **PDF-Extraktion im Binary:** `pdf-parse` und `analyzePdfLayout()` (pdfjs) lesen ein LinkedIn-PDF im kompilierten Binary korrekt (6321 Zeichen, Layout-Daten).
- **Frontend im WKWebView:** Login-Seite rendert korrekt (Schriften, Dark-Theme). Das Board mit den importierten Daten wurde gegen denselben Sidecar im Chromium-Browserfenster geprüft; im WKWebView kam ich wegen der Eingabe-Automatisierung nicht über das Login hinaus (siehe unten) – bitte einmal von Hand anmelden und Board/Tabelle anschauen.

## Zahlen (MacBook/iMac Apple Silicon, Release-Build)

| | Wert |
|---|---|
| `Application-Pal.app` | **124 MB** |
| davon Sidecar (`bun --compile`, inkl. `@napi-rs/canvas`) | 94 MB |
| davon PGlite WASM + Daten | 15 MB |
| davon Frontend | 11 MB |
| davon Tauri-Hülle | 4 MB |
| DMG (komprimiert) | **57 MB** |
| Leere DB + Import auf Platte (`pgdata`) | 39 MB |
| Kaltstart, frische DB (initdb + Migration) bis Backend bereit | **1,3 s** |
| Warmstart, bestehende DB | **0,6–0,7 s** (PGlite selbst 160 ms) |
| `tauri build` (inkrementell, ohne Rust-Erstkompilation) | ~1 min |

Die Ladeseite erscheint sofort; die Startzeit ist die Wartezeit bis zum Wechsel aufs Frontend.

## Was nicht lief / Stolpersteine

1. **`bcrypt` (natives Addon, node-pre-gyp) lässt sich nicht einkompilieren.** Ersetzt durch `bcryptjs` (reines JS, gleiches `$2b$`-Format, bestehende Hashes bleiben gültig). Etwas langsamer beim Hashen – für Login unkritisch. Lohnt sich auch für `main` (kein node-gyp im Docker-Build).
2. **pdfjs braucht `DOMMatrix` & Co. schon beim Laden.** Unter Node holt `pdf-parse` sie per dynamischem `require("@napi-rs/canvas")`, im Binary scheitert das (Backend stürzt beim Start ab). Lösung: `sidecar-polyfill.ts` importiert `@napi-rs/canvas` statisch (Bun bettet das native Addon ein, +25 MB) und setzt die Globals. Die Warnung „Cannot load @napi-rs/canvas“ von pdf-parse im Log ist danach harmlos.
3. **pdfjs „fake worker“** lädt `./pdf.worker.mjs` relativ zu sich – im Binary nicht vorhanden („Setting up fake worker failed“). Lösung: Worker statisch importieren und als `globalThis.pdfjsWorker` setzen.
4. **PGlite-Assets** (`pglite.wasm`, `initdb.wasm`, `pglite.data`) findet PGlite im Binary nicht über `import.meta.url`. Lösung: als Tauri-Ressourcen mitliefern, `PGLITE_ASSETS_DIR` lädt sie von Hand.
5. **Bug in `/api/import` (auch unter Postgres):** Zeitstempel kommen als ISO-Strings, Drizzle-`timestamp`-Spalten erwarten `Date` → „value.toISOString is not a function“, der Import brach bei der ersten Bewerbung ab. Behoben (`revive()` wandelt alle `PgTimestamp`-Felder vor dem Insert). Kandidat für einen kleinen PR nach `main`.
6. **`npm run build --workspace frontend` schreibt `.js`-Dateien nach `frontend/src/`** (`tsc -b`, bekannter Fallstrick). Das Build-Skript nutzt deshalb nur `vite build`. Die erzeugten Dateien habe ich gelöscht.
7. **Backspace navigiert im WKWebView zurück** auf die Ladeseite, wenn kein Eingabefeld den Fokus hat. Fix für M1: Ladeseite per `location.replace` verlassen (statt `navigate`) oder Zurück-Navigation unterbinden.
8. **Absturz der Hülle hinterlässt den Sidecar** als verwaisten Prozess (normales Beenden räumt ihn ab). Fix für M1: Sidecar beendet sich selbst, wenn stdin/der Elternprozess wegfällt (z.B. `process.stdin.on("end")` bzw. PPID-Check), plus Lock-Datei gegen Doppelstart auf demselben `pgdata`.
9. **Hintergrund-Eingaben per Accessibility** kommen im WKWebView nur bruchstückhaft an – betrifft nur Test-Automatisierung, nicht Nutzer.
10. **`KB_BASE_PATH`** zeigt per Default auf einen Pfad auf Claus' Rechner; der Sidecar setzt ihn auf den Datenordner. Sollte generell einen neutralen Default bekommen.

Nicht getestet in M0: Windows/WebView2, Signierung/Notarisierung (App ist ungesigniert, startet lokal nur, weil selbst gebaut), Google-/LinkedIn-OAuth, KI-Aufrufe aus dem Sidecar, Drag & Drop und Sticky-Tabelle im WKWebView, Start-Token für den lokalen Server.

## Entscheidung: PGlite vs. SQLite

**PGlite.** Begründung:

- **Null Code-Änderung an den Abfragen.** Gleicher Dialekt, gleiches Schema, gleiche drizzle-API; die ganze Umstellung ist eine Datei (`db.ts`). Mit SQLite wären `pgTable` → `sqliteTable`, `ilike`, `uuid`/`gen_random_uuid()`, `timestamp with time zone`, `boolean`, `returning`-Details und `onConflictDoUpdate` auf zwei Schema-Varianten zu pflegen – dauerhaft doppelte Arbeit für Web und Desktop.
- **Export/Import zwischen Docker und Desktop** funktioniert 1:1 (gleiche Typen), wichtig für den Umzug bestehender Nutzer.
- **Leistung reicht klar:** Start 0,6–1,3 s, Abfragen auf Bewerbungs-Datenmengen nicht spürbar.
- **Kosten:** +15 MB App-Grösse und ~40 MB auf Platte pro Datenbestand; PGlite ist ein Ein-Prozess-System (nur ein Sidecar pro Datenordner – passt, weil alle Profile in einer DB liegen). PGlite ist noch 0.x (getestet 0.5.16 mit drizzle-orm 0.34.1) – Version pinnen und vor Updates den Import-Test laufen lassen.

## Empfehlungen für M1

- Kleine PRs nach `main`: `/api/import`-Zeitstempel-Fix, `bcryptjs`, DB-Treiber-Schicht (`DB_DRIVER`), `STATIC_DIR`/`HOST`.
- `desktop/` in die Root-Workspaces aufnehmen, sobald die Root-Skripte `--if-present` nutzen (heute würde `npm run build --workspaces` den Tauri-Build auslösen). In M0 bewusst eigenständig mit eigener `package-lock.json`.
- Sidecar-Lebenszyklus härten (Punkt 8), Start-Token zwischen Hülle und Sidecar, Backspace-Navigation (Punkt 7).
- Migrationen für PGlite: künftig `drizzle-kit generate` als Quelle der Wahrheit (inkrementelle Migrationen statt einer Gesamtdatei), damit Desktop-Updates bestehende Datenbanken migrieren.
- Grösse: Sidecar von 94 MB lässt sich prüfen (z.B. `@napi-rs/canvas` nur für PDF-Funktionen nötig – ggf. pdfjs ohne Canvas-Polyfill mit Minimal-`DOMMatrix`). Für M0 nicht nötig.

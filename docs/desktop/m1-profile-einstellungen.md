# M1: Profile und Einstellungen pro Nutzer

Stand: 11.11.2026 · Branch `desktop`

## Entscheidungen (mit Claus abgestimmt)

- **API-Keys:** pro Profil in der DB, AES-256-GCM-verschlüsselt. Der Schlüssel liegt auf dem Desktop im macOS-Schlüsselbund (Windows: Anmeldeinformationsverwaltung), im Docker in `SECRETS_KEY` bzw. wird aus `JWT_SECRET` abgeleitet. Ein Codepfad für Web und Desktop.
- **Profil-Login (Desktop):** Profilauswahl beim Start; jedes Profil wählt selbst: ohne Schutz, PIN (4–8 Ziffern) oder Passwort. Neue Profile ohne Einladungscode.
- **Branching:** Langzeit-Branch `desktop`; web-relevante Teile zusätzlich als kleine PRs nach `main`.

## Was gebaut wurde

### Einstellungen pro Nutzer (Web + Desktop)

| Teil | Wo |
|---|---|
| Spalten `user_profile.ui_settings` (JSON) und `user_profile.ai_secrets` (verschlüsselt) | `shared/src/schema.ts`, Migration `backend/drizzle-pglite/0001_*`, Docker: `backend/drizzle/0014_profiles_settings.sql` (manuell anwenden) |
| `GET /api/settings` → `{ settings, secrets: {anthropic: bool, …}, secretsAvailable }` | `backend/src/index.ts` |
| `PATCH /api/settings` – flaches Mergen, `ai` eine Ebene tiefer, Key-Felder werden verworfen | |
| `PUT /api/settings/secrets { keys: { anthropic: "…" } }` – `""` löscht einen Key | |
| Verschlüsselung + Request-Kontext | `backend/src/secrets.ts` |
| Store-Abgleich | `frontend/src/lib/settingsSync.tsx` |
| Key-Eingabe | `ApiKeyInput` in `frontend/src/pages/SettingsPage.tsx` |

Synchronisiert werden Theme, Akzent, Dichte, Kartenvariante, Drive-Benennungsregeln, Tabellenlayout und die KI-Konfiguration ohne Keys. Gerätebezogenes bleibt im `localStorage` (Rail offen/zu, ausgewählte Bewerbung, laufende KI-Jobs). Die UI-Sprache lief schon vorher über `user_profile.ui_language`.

**Wie die Keys zum KI-Aufruf kommen:** Der Client schickt `ai` weiterhin bei jedem Aufruf mit, aber ohne Keys. Die Auth-Middleware legt bei Nicht-GET-Anfragen die entschlüsselten Keys des Nutzers in einen `AsyncLocalStorage`-Kontext; `aiKey(ai, "anthropic")` nimmt den Key aus dem Body, sonst den gespeicherten. Hono parst den JSON-Body bei jedem `c.req.json()` neu, darum geht es nicht über ein Umschreiben des Bodys. Hintergrund-Jobs (CV-Import, LinkedIn-Check), die in einer Anfrage starten, erben den Kontext.

**Umzug bestehender Keys:** Beim ersten Laden nach dem Update lädt der Client Keys, die noch im `localStorage` stehen, für den angemeldeten Nutzer hoch und löscht sie lokal. Hat der Server schon einen Key für den Anbieter, gewinnt der Server.

**Ohne Schlüssel** (Web ohne `SECRETS_KEY` und ohne `JWT_SECRET`): `secretsAvailable: false`, die Keys bleiben wie bisher im Browser.

Regeln – nicht „reparieren“:
- Keys verlassen den Server nie: `publicProfile()` entfernt `aiSecrets` aus `GET/PUT/PATCH /api/profile`, der Export enthält sie nicht, der Import übernimmt keine und behält bei `replace` die gespeicherten.
- Ändert sich `JWT_SECRET` (ohne `SECRETS_KEY`), sind gespeicherte Keys nicht mehr lesbar und gelten als leer – der Nutzer gibt sie neu ein. Für Docker darum `SECRETS_KEY` setzen.
- Der Settings-Abgleich schreibt erst nach dem ersten Laden zurück, damit der Zustand des vorherigen Profils nie in ein neu gewähltes Profil wandert.
- `ui_settings`: `NULL` = Konto von vor M1 → der Client übernimmt einmal die Einstellungen dieses Geräts (Umzug). `"{}"` = neues Konto (Profil oder Web-Registrierung) → Standardwerte, nie die Einstellungen des zuvor angemeldeten Profils.

### Profile (nur `APP_MODE=desktop`)

| Endpunkt | Zweck |
|---|---|
| `GET /api/auth/status` | zusätzlich `mode: "web" \| "desktop"` |
| `GET /api/auth/profiles` | öffentlich, nur Desktop: `[{ id, name, authMode }]` |
| `POST /api/auth/profiles { name, authMode, secret?, email? }` | neues Profil ohne Einladung; ohne E-Mail ein Platzhalter `profil-…@profile.local` |
| `POST /api/auth/profile-login { id, secret? }` | 5 Fehlversuche → 60 s Sperre pro Profil |
| `PATCH /api/account { name }`, `PUT /api/account/protection { authMode, secret?, current? }` | geschützt; PIN/ohne Schutz nur im Desktop-Modus |
| `GET /api/auth/me` | zusätzlich `id`, `name`, `authMode`, `mode` |

Frontend: `components/ProfilePicker.tsx` ersetzt im Desktop-Modus die Login-Seite; in der Rail führt „Nutzer wechseln“ direkt zur Profilauswahl; in den Einstellungen ersetzt „Profil & Schutz“ die Abschnitte Einladungen und Sicherheit (Passkeys). Nach jedem Profilwechsel wird der React-Query-Cache geleert.

### Härtung der Desktop-Hülle (aus dem M0-Bericht)

- **Start-Token:** Die Hülle erzeugt pro Start `DESKTOP_TOKEN`; das Fenster öffnet einmal `/__desktop/enter?token=…`, das setzt ein httpOnly-Cookie (`SameSite=Lax` – mit Strict verwirft WKWebView das Cookie beim Redirect, weil die erste Navigation von der `tauri://`-Ladeseite kommt). Ohne Cookie antwortet der Sidecar `403` – auch auf statische Dateien. Nur `/health` ist frei.
- **Lebenszyklus:** Der Sidecar hängt an der stdin-Pipe der Hülle (`DESKTOP_PARENT_PIPE=1`). Schliesst sie sich – normales Beenden oder Absturz –, schliesst er PGlite sauber und beendet sich. Beim Beenden schliesst die Hülle die Pipe und wartet bis 5 s, erst dann `kill`.
- **Nur eine Instanz** (`tauri-plugin-single-instance`): ein zweiter Start holt das vorhandene Fenster nach vorne.
- **Ladeseite** wird per `location.replace` verlassen und landet nicht mehr im Verlauf (Backspace-Befund aus M0).
- **`SECRETS_KEY`** kommt aus dem Schlüsselbund (`com.medvesek.d2603` / `secrets-key`), wird beim ersten Start erzeugt.

## Offen / nicht in M1

- Google-Token pro Profil ohne gemeinsamen Fallback (`getDriveAccessToken`) → M2 zusammen mit `drive.file` + Picker.
- „Passwort vergessen“ für Profile: mit E-Mail-Wiederherstellung wie im Web, ohne E-Mail nur über ein anderes Profil bzw. Neuanlage. Noch nicht gebaut.
- PIN-Sperre liegt im Speicher (Neustart setzt sie zurück) – für den Familien-Fall ausreichend.
- Windows nicht getestet.

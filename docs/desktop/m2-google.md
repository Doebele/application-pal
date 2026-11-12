# M2: Google pro Profil, `drive.file`, Picker, Loopback-Anmeldung

Stand: 11.11.2026 · Branch `desktop`

## Was gebaut wurde

| Teil | Wo |
|---|---|
| Google-Token nur pro Profil, kein gemeinsamer Fallback im Desktop-Modus | `getDriveAccessToken`, `GET /api/google/status` |
| Scopes Desktop: `openid email profile drive.file calendar.readonly` (statt `drive` + `documents` + `spreadsheets`) | `GOOGLE_SCOPES` in `backend/src/index.ts` |
| Loopback-Anmeldung mit PKCE im Systembrowser | `POST /api/google/connect`, `GET /api/google/callback` (Desktop-Zweig) |
| Picker-Konfiguration | `GET /api/google/picker-config` → `{ available, apiKey, appId, accessToken }` |
| Vorlage aus Drive übernehmen (Kopie in den eigenen Ordner „Pal-Templates“) | `POST /api/drive/templates/import { fileId }` |
| Vorlagenliste ohne `GOOGLE_MASTER_FOLDER_ID` → eigener Ordner „Pal-Templates“ | `GET /api/drive/templates` (gilt auch fürs Web) |
| Picker-Knopf | `frontend/src/lib/googlePicker.tsx` (`GooglePickerButton`, `openGooglePicker`) |
| Picker eingebaut | Einstellungen (Bewerbungsordner, RAV-Tabelle), RAV-Dialog, Dokumente (Google Doc), Vorlagen („Vorlage aus Google Drive übernehmen“) |
| Zugangsdaten an den Sidecar | `google_env()` in `desktop/src-tauri/src/lib.rs` |

### Ablauf „Google verbinden“ (Desktop)

1. Einstellungen → „Google verbinden“ → `POST /api/google/connect`.
2. Der Sidecar erzeugt `state` (zufällig, einmalig, 10 min gültig) und PKCE-Verifier, merkt sich beides im Speicher zusammen mit der Profil-ID und öffnet die Google-Seite im **Standardbrowser** (`open` / `rundll32` / `xdg-open`). Google lässt die Anmeldung in eingebetteten Webviews nicht zu.
3. Google leitet auf `http://127.0.0.1:<Port>/api/google/callback?state=…&code=…` um. Die Sidecar-Sperre lässt genau diese Route ohne Cookie durch, aber nur mit `state`. Unbekannter oder schon benutzter `state` → 400.
4. Code-Tausch mit `code_verifier`, Token wird für das Profil gespeichert, das den Ablauf gestartet hat. Der Browser zeigt „Google verbunden – du kannst dieses Fenster schliessen“.
5. Die App fragt alle 2 s `/api/google/status` ab (höchstens 5 min) und schaltet dann auf „Verbunden“.

Im Desktop-Modus loggt der Callback nie ein (keine Google-Anmeldung als Profil-Login) und speichert nie ein gemeinsames Token. `/api/google/auth-url` antwortet dort mit 400.

### Was `drive.file` bedeutet

Die App sieht nur Dateien, die sie **selbst angelegt** hat (Bewerbungsordner, Dokumente, Vorlagen aus „Neu erstellen“, RAV-Tabellen aus „Neue Tabelle“) oder die der Nutzer **im Picker gewählt** hat. Folgen:

- Eingefügte Links auf fremde Dateien (Ordner-URL, RAV-Tabelle, Google-Doc-Link in Dokumente) funktionieren auf dem Desktop nicht → dafür gibt es jeweils den Knopf „… in Drive wählen“.
- Gewählte Vorlagen werden in „Pal-Templates“ **kopiert**; die Kopie gehört der App und bleibt dauerhaft erreichbar.
- Ein im Picker gewählter Ordner: Die App darf darin neue Dateien anlegen, sieht aber nur ihre eigenen.
- CV-Quellen (`/api/cv/sources`) finden PDFs neben dem CV nur, wenn die App sie angelegt hat.

Im Web bleibt alles beim Alten (`drive`-Scope, Link einfügen funktioniert). Der Picker erscheint dort zusätzlich, sobald `GOOGLE_API_KEY` und `GOOGLE_APP_ID` gesetzt sind.

## Was Claus in der Google Cloud Console einrichten muss

Ohne diese Schritte meldet „Google verbinden“ in der Desktop-App „nicht eingerichtet“ (503) und der Picker-Knopf erscheint nicht.

1. **OAuth-Client vom Typ „Desktop-App“** im bestehenden Projekt anlegen (APIs & Dienste → Anmeldedaten). Der bestehende Web-Client taugt nicht: Er erlaubt keine Loopback-Umleitung auf einen wechselnden Port.
2. **OAuth-Zustimmungsbildschirm:** Scope `…/auth/drive.file` hinzufügen (nicht sensibel), `calendar.readonly` ist sensibel → für die Veröffentlichung braucht es die normale Prüfung, aber **keine** Sicherheitsbewertung wie bei `drive`.
3. **Google Picker API** aktivieren.
4. **API-Schlüssel** erstellen, eingeschränkt auf die Picker API. Website-Einschränkung: `http://127.0.0.1` (der Port wechselt pro Start).
5. **Projektnummer** (nicht Projekt-ID) notieren → `appId`.
6. Zum Testen ohne Neubau im Datenordner ablegen:
   `~/Library/Application Support/com.medvesek.d2603/google-client.json`
   ```json
   { "clientId": "….apps.googleusercontent.com", "clientSecret": "…", "apiKey": "…", "appId": "123456789012" }
   ```
   Für die verteilte App beim Bauen als `D2603_GOOGLE_CLIENT_ID`, `D2603_GOOGLE_CLIENT_SECRET`, `D2603_GOOGLE_API_KEY`, `D2603_GOOGLE_APP_ID` setzen (werden eingebettet). Das Secret eines Desktop-Clients gilt laut Google nicht als geheim; Schutz kommt von PKCE und der Loopback-Umleitung.

## Getestet

Mit dem gebauten Sidecar (Platzhalter-Client-ID, Browserstart unterdrückt) und per curl:

- Status meldet `configured`, `scopeMode: "drive.file"`, `pickerAvailable`; ohne eigenes Token `connected: false`.
- `POST /api/google/connect` liefert eine URL mit `redirect_uri=http://127.0.0.1:<Port>/api/google/callback`, `state`, `code_challenge` (S256), `drive.file`-Scope.
- Callback ohne Cookie und ohne `state` → 403; falscher `state` → 400; gültiger `state` mit falschem Code → Fehlerseite (Google: „OAuth client was not found“); derselbe `state` ein zweites Mal → 400.
- Picker-Konfiguration ohne Verbindung → `available: false`.
- UI: „Google verbinden“ wechselt auf „Warte auf Browser …“ mit Hinweis.
- Alle Self-Checks grün, Typecheck Backend/Frontend grün.

**Nicht getestet** (braucht die echten Zugangsdaten aus Schritt 1–5): der erfolgreiche Token-Tausch, ob der **Picker in WKWebView** lädt (er bettet ein `docs.google.com`-iframe ein; Safari blockiert Drittanbieter-Cookies – mit `setOAuthToken` sollte er ohne Cookies auskommen, das ist aber das grösste offene Risiko), und die Drive-Funktionen mit `drive.file`.

## Nachtrag: Picker im Standardbrowser

Im App-Fenster zeigte der Picker „Can't access your Google Account“: Sein iframe von `docs.google.com` braucht die Google-Cookies des Nutzers, und WKWebView blockiert sie. In der Desktop-App läuft er deshalb auf einer Seite des Sidecars im Standardbrowser:

1. `POST /api/google/picker-session { kind, title, lang }` legt eine Sitzung an (zufällige ID, einmalig, 10 min, an das Profil gebunden) und öffnet `http://127.0.0.1:<Port>/api/google/picker-page?s=<id>`.
2. Die Seite lädt den Picker mit Token, API-Schlüssel und Projektnummer und meldet die Wahl an `POST /api/google/picker-result?s=<id>` (Abbruch ebenso).
3. Die App fragt `GET /api/google/picker-session/:id` alle 1,5 s ab; „Abbrechen“ im Knopf löscht die Sitzung (`DELETE`).

Sidecar-Sperre und Auth-Middleware lassen die beiden Browser-Routen nur mit `s` bzw. nur im Desktop-Modus durch; die Routen prüfen die Sitzung selbst. Im Web bleibt der eingebettete Picker.

## Offen

- **LinkedIn-Callback** auf dem Desktop: LinkedIn verlangt eine fest registrierte Redirect-URL, der Sidecar-Port wechselt. Bis dahin bleibt der Weg „Token einfügen“ (funktioniert ohne Callback). Möglichkeit: fester Zusatz-Port nur für den Callback.
- Google-Refresh-Tokens liegen unverschlüsselt in `google_oauth_tokens` (wie im Web). Könnte mit dem Schlüssel aus M1 verschlüsselt werden.
- Picker für die CV-Quellen und „Google Doc kopieren“ in Bewerbungen nutzen bisher die Dokument-Bibliothek; die Links dort kommen auf dem Desktop jetzt aus dem Picker, sind also erreichbar.

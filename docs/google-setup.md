# Google Drive & Sign-In einrichten

Application Pal kann Google OAuth für zwei Dinge nutzen:
- **Mit Google anmelden** — kein separates Passwort nötig
- **Google Drive / Docs** — Bewerbungsunterlagen direkt verwalten

Beide Funktionen werden in einem einzigen OAuth-Consent-Dialog konfiguriert.

---

## Schritt 1 — Google Cloud Console

1. Öffne [console.cloud.google.com](https://console.cloud.google.com)
2. Erstelle ein neues Projekt (z.B. „Application Pal")
3. Aktiviere die APIs:
   - **Google Drive API**
   - **Google Docs API**
   - **Google Identity** (für Anmeldung mit Google — wird über den OAuth Consent Screen automatisch aktiviert)

## Schritt 2 — OAuth Consent Screen

1. Navigiere zu **APIs & Dienste → OAuth-Zustimmungsbildschirm**
2. Wähle **Extern**
3. Fülle aus:
   - App-Name: `Application Pal`
   - Nutzer-E-Mail-Adresse: deine Gmail
4. Scopes hinzufügen:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/documents`

   > ⚠️ **Wichtig**: Es muss `drive` (Vollzugriff) sein, **nicht** `drive.file`. Der eingeschränkte `drive.file`-Scope erlaubt nur Dateien, die die App selbst erstellt hat — Vorlagen aus dem Master-Ordner können damit nicht kopiert werden.
5. Testnutzer hinzufügen: deine eigene Gmail-Adresse
6. Speichern

## Schritt 3 — OAuth Client erstellen

1. **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID**
2. Anwendungstyp: **Webanwendung**
3. Name: `Application Pal Local`
4. Autorisierte Weiterleitungs-URIs:
   ```
   http://localhost:8070/api/google/callback
   ```
   Bei Server-Deployment zusätzlich:
   ```
   https://deine-domain.de/api/google/callback
   ```
5. **Erstellen** → Client-ID und Client-Secret kopieren

## Schritt 4 — .env konfigurieren

```env
GOOGLE_CLIENT_ID=647153348459-xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
GOOGLE_REDIRECT_URI=http://localhost:8070/api/google/callback
GOOGLE_FRONTEND_URL=http://localhost:8070
GOOGLE_SCOPES=openid email profile https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents
```

## Schritt 5 — Container neu starten

```bash
docker compose up -d backend
```

Danach in Application Pal: **Settings → Integrationen → Mit Google verbinden**.

---

## Optional: Vorlagen-Ordner (Master-Folder)

Wenn du Dokument-Vorlagen (z.B. formatierten Lebenslauf, Anschreiben-Vorlage) in Drive hast, die beim Erstellen eines Bewerbungsordners automatisch zur Verfügung stehen sollen:

1. Erstelle einen Ordner in Google Drive, z.B. „Bewerbungs-Vorlagen"
2. Lege deine formatierten Google Docs darin ab
3. Kopiere die Ordner-ID aus der URL: `drive.google.com/drive/folders/**ORDNER-ID**`
4. Trage sie in `.env` ein:

```env
GOOGLE_MASTER_FOLDER_ID=deine-ordner-id-hier
```

Die Vorlagen erscheinen dann im Dokumente-Tab unter „Aus Bibliothek zuweisen" und können mit einem Klick in den jeweiligen Bewerbungsordner kopiert werden.

---

## Optional: Standard-Ablageordner

Alle neu erstellten Bewerbungsordner werden standardmässig in „Meine Ablage" angelegt. Um einen anderen Zielordner zu verwenden:

**Settings → Integrationen → Google Drive Ordner** → Ordner-ID eintragen oder über den Picker wählen.

Alternativ in `.env`:
```env
GOOGLE_APPLICATIONS_FOLDER_ID=deine-ordner-id-hier
```

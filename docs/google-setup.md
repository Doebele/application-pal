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
   - **Google+ API** (für Anmeldung mit Google)

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
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/documents`
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
GOOGLE_SCOPES=openid email profile https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents
```

## Schritt 5 — Container neu starten

```bash
docker compose up -d backend
```

Danach in Application Pal: **Settings → Integrationen → Mit Google verbinden**.

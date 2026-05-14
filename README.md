# Application Pal

Persönliches Bewerbungs-Management-Tool mit KI-Unterstützung. Läuft vollständig lokal auf deinem Rechner via Docker — kein Cloud-Account, keine Abo-Kosten, deine Daten bleiben bei dir.

---

## Features

- **Kanban-Board** — Bewerbungen per Drag & Drop durch die Phasen ziehen (Inbox → Vorbereitung → Versendet → Interview → Entscheid)
- **KI-Import** — Job-URL einfügen, KI extrahiert Firma, Rolle, Ort, Gehalt und Tags automatisch
- **Match-Score** — KI bewertet wie gut dein Profil zur Stelle passt (0–100 mit Breakdown)
- **Dokumente** — Globale Dokument-Bibliothek (Lebenslauf, Zeugnisse, Portfolio) mit Google Drive Integration
- **Kontakte** — Ansprechpersonen pro Bewerbung mit Passkey-Login
- **Profil** — Master-CV, LinkedIn-Bio und persönliche Stichpunkte fliessen in KI-Analysen ein
- **Sicherer Login** — E-Mail/Passwort, Google Sign-In, Passkeys (Apple Face ID / Touch ID)
- **Export/Import** — Vollständiges Backup als JSON

---

## Installation

### Voraussetzungen

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac / Windows) oder Docker + Docker Compose (Linux)

### Schritt 1 — Dateien herunterladen

```bash
curl -O https://raw.githubusercontent.com/clausmedvesek/application-pal/main/docker-compose.release.yml
curl -O https://raw.githubusercontent.com/clausmedvesek/application-pal/main/.env.example
cp .env.example .env
```

### Schritt 2 — Konfiguration

Öffne `.env` in einem Texteditor und ändere mindestens:

```env
POSTGRES_PASSWORD=dein-sicheres-passwort
```

Optional (für persistente Sessions über Neustarts hinaus):
```env
JWT_SECRET=$(openssl rand -hex 32)
```

### Schritt 3 — Starten

```bash
docker compose -f docker-compose.release.yml up -d
```

Beim ersten Start dauert es ~1 Minute bis alle Dienste bereit sind.

### Schritt 4 — Fertig

Öffne **http://localhost:8070** — du wirst durch das Setup-Formular geführt (E-Mail + Passwort festlegen).

---

## Update

```bash
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

Deine Daten bleiben erhalten (PostgreSQL-Volume wird nicht gelöscht).

---

## Optionale Funktionen

| Funktion | Anleitung |
|----------|-----------|
| Google Drive & Sign-In | [docs/google-setup.md](docs/google-setup.md) |
| KI (LM Studio / Anthropic) | [docs/ai-setup.md](docs/ai-setup.md) |
| Daten-Backup & Migration | [docs/backup.md](docs/backup.md) |

---

## Entwickler-Setup (build from source)

```bash
git clone https://github.com/clausmedvesek/application-pal.git
cd application-pal
cp .env.example .env   # .env anpassen
docker compose build
docker compose up -d
```

Lokale Entwicklung (hot-reload):
```bash
npm install
npm run dev --workspace frontend   # http://localhost:5174
npm run dev --workspace backend    # http://localhost:3000
```

Typecheck:
```bash
npm run typecheck --workspace frontend
npm run typecheck --workspace backend
```

---

## Sicherheit

- Alle Daten lokal in PostgreSQL — kein Cloud-Sync
- Login mit E-Mail/Passwort (bcrypt), Google OAuth oder Passkey (WebAuthn / Face ID)
- JWT-Token in httpOnly-Cookies (kein localStorage)
- Single-User-Design: nur ein Account pro Instanz

---

## Lizenz

MIT

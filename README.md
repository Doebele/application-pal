# Application Pal

Persönliches Bewerbungs-Management-Tool mit KI-Unterstützung. Läuft vollständig lokal auf deinem Rechner via Docker — kein Cloud-Account, keine Abo-Kosten, deine Daten bleiben bei dir.

---

## Features

### Bewerbungsverwaltung
- **Kanban-Board** — Bewerbungen per Drag & Drop durch die Phasen ziehen
- **Prozess-Navigation** — Fortschrittsbalken mit Gabelung am Ende: *Contract offer* (oben) und *Rejected* (unten)
- **Stage-Aufgaben** — Automatische Checklisten pro Bewerbungsphase; manuell erweiterbar
- **Archivierung** — Mit Grundangabe (nicht verfügbar / nicht relevant / vergeben / sonstiges)
- **Kontakte** — Ansprechpersonen pro Bewerbung (Recruiter, Hiring Manager, etc.)
- **Aktivitäten-Timeline** — Notizen, Emails, Interviews, Deadlines chronologisch erfassen

### Drawer-Tabs
| Tab | Inhalt |
|-----|--------|
| **Aktionen** | Stage-Aufgaben + KI-Aktions-Buttons (Tile-Grid) + generierte Inhalte + Timeline |
| **Details** | Übersichtsfelder + KI-Erkenntnisse-Kacheln + Stellenbeschreibung (Markdown) |
| **Dokumente** | Google-Drive-Ordner + zugewiesene Docs + Dokumenten-Bibliothek |
| **Insights** | Match-Score-Analyse mit Breakdown (Fachkompetenz / Erfahrung / Soft Skills / Kultur) |
| **Kontakte** | Ansprechpersonen der Bewerbung |
| **Notizen** | Freie Notizen |

### KI-Import & Analyse
- **KI-Import** — Job-URL einfügen, KI extrahiert Firma, Rolle, Ort, Gehalt und Tags automatisch
- **Match-Score** — KI bewertet wie gut dein Profil zur Stelle passt (0–100 mit Stärken/Lücken-Breakdown)
- **Stellenbeschreibung** — Markdown-Rendering mit Vorschau/Bearbeiten-Toggle, klickbare Links

### KI-Coaching (Aktionen-Tab)
Alle KI-Ergebnisse werden mit Zeitstempel in der Datenbank gespeichert und beim Wiedereröffnen wiederhergestellt. Checkmarks zeigen welche Aktionen bereits ausgeführt wurden.

**Inbox-Phase:**
| Aktion | Ergebnis |
|--------|----------|
| Glassdoor Rating | KI-Schätzung mit Sternebewertung, CEO-Zustimmung %, Pros/Cons, editierbarer URL |
| Kununu Rating | KI-Schätzung mit Bewertung, editierbare Kununu-URL |
| LinkedIn Firmenprofil | KI-generierte Unternehmens-URL, Mitarbeiterzahl, editierbar |
| Gehalts-Check Schweiz | Lohnband (Min/Median/Max) als Balkengrafik mit Wunschgehalt-Referenzlinie |
| ATS-Keywords | Must-Have / Nice-to-Have / Soft Skills / Tools als Badges |

**CV- & Anschreiben-Phase:**
- CV-Highlights, Google Doc aus Master-CV, Anschreiben generieren/reviewen, 3 Eröffnungssätze

**Bewerbungs- & Wartephase:**
- Bewerbungs-Email, Follow-up-Email, LinkedIn-Vernetzungsnachricht, Unternehmensrecherche, Ackermann-Verhandlungs-Script

**Interview-Phase:**
- Interview-Vorbereitung (Rollenspezifische Fragen, STAR-Beispiele, Chris-Voss-Methode, Rückfragen), Gehaltsverhandlungs-Tipps, Google Kalender & iCal Export

**Abschluss-Phase:**
- Onboarding-Checkliste (30/60/90 Tage), Feedback-Email, Absage-Emails für andere Stellen

### KI-Erkenntnisse im Details-Tab
Alle generierten KI-Ergebnisse erscheinen als **Tile-Grid im Details-Tab** — kompakte Kacheln (einfach oder doppelbreite je nach Inhalt), Klick öffnet die **vollständige Detailansicht** im Vollbild:
- Zahlenkacheln (Glassdoor ★ 3.9, Gehaltsband CHF 90k–125k) compact mit Kennzahl
- Textkacheln (Unternehmensrecherche, Letter-Review) mit gekürzter Vorschau
- Volle Detailansicht: Balkengrafiken, editierbare Felder (URL, Rating), Links

### Gehaltsgrafik
- Horizontaler Balken: Lohnband von Min bis Max
- Vertikale Akzentlinie: Median
- Vertikale Amber-Linie: Wunschgehalt aus dem Profil (einstellbar unter Einstellungen → Profil)

### Interview-Termin
- Datum, Uhrzeit, Dauer, Format (Vor Ort / Video / Telefon), Adresse/Meeting-URL/Code, Gesprächspartner
- Export zu Google Kalender (vorbefüllt, optional mit gespeicherter Kalender-ID)
- iCal-Download (.ics) für Apple Kalender, Outlook etc.

### Dokumente
- **Globale Bibliothek** — Lebenslauf, Zeugnisse, Referenzen, Figma-Links, Portfolio (kategorisiert)
- **Google Drive Integration** — Bewerbungsordner pro Stelle anlegen, Vorlagen kopieren, Live-Ordnerinhalt, Dateien löschen
- Bibliotheks-Docs der Bewerbung zuweisen, automatisch in Drive kopieren

### Profil
- Master-CV, LinkedIn-Bio, persönliche Stichpunkte fliessen in alle KI-Analysen ein
- **Wunschgehalt** — wird in der Gehalts-Check-Balkengrafik als Referenzlinie angezeigt
- Google Kalender-ID für automatisch vorausgewählten Kalender

### Authentifizierung
- E-Mail/Passwort (bcrypt), Google Sign-In, Passkeys (Apple Face ID / Touch ID / Windows Hello)
- „Angemeldet bleiben" — session-basiert oder 90-Tage-persistenter Cookie
- Konfigurierbarer Session-Timeout (15 min bis 30 Tage)
- Passwort-Recovery via E-Mail OTP

### Export / Backup
- JSON-Export aller Daten (Bewerbungen, Dokumente, Kontakte, Aktivitäten, Profil)
- Optional: Backup direkt in Google Drive speichern

---

## Design

- **Dark Theme** + optionaler Light Mode
- **Fira Sans** (UI), **Libre Caslon Text** (Display), **Fira Mono** (Zahlen, tabular-nums)
- **Weiße Halo-Schatten** auf Karten und Modals (Signatur-Look)
- **Iconoir** Icon Library (durchgängig)
- Accent-Farbe frei wählbar (Indigo, Violet, Emerald, Amber, Rose)
- Kompakt- und Komfort-Ansicht (Dichte-Einstellung)
- Kanban-Kartenvarianten (kompakt, standard, ausführlich)

---

## Installation

### Voraussetzungen

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac / Windows) oder Docker + Docker Compose (Linux)

### Schritt 1 — Dateien herunterladen

```bash
curl -O https://raw.githubusercontent.com/Doebele/application-pal/main/docker-compose.release.yml
curl -O https://raw.githubusercontent.com/Doebele/application-pal/main/.env.example
cp .env.example .env
```

### Schritt 2 — Konfiguration

Öffne `.env` und ändere mindestens:

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

## KI-Konfiguration

Unterstützte Anbieter (einstellbar unter ⚙ Einstellungen → KI):

| Anbieter | Anforderung |
|----------|-------------|
| **LM Studio** (lokal) | LM Studio auf demselben Rechner installieren, Modell laden (empfohlen: Qwen3 14B+) |
| **Anthropic** | API-Key von [console.anthropic.com](https://console.anthropic.com) |

Alle KI-Funktionen sind optional — ohne Konfiguration funktioniert die App als reines Verwaltungswerkzeug.

---

## Entwickler-Setup (build from source)

```bash
git clone https://github.com/Doebele/application-pal.git
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

DB-Migration (nach Schema-Änderungen):
```bash
docker exec application-pal-db psql -U postgres -d application_pal -c "ALTER TABLE ..."
```

Technischer Überblick: [CLAUDE.md](CLAUDE.md)

---

## Ports

| Dienst | Port |
|--------|------|
| Frontend (nginx) | 8070 |
| Backend (Hono API) | 8071 |
| PostgreSQL | 15436 |

---

## Sicherheit

- Alle Daten lokal in PostgreSQL — kein Cloud-Sync
- Login mit E-Mail/Passwort (bcrypt), Google OAuth oder Passkey (WebAuthn)
- JWT-Token in httpOnly-Cookies (kein localStorage)
- Single-User-Design: nur ein Account pro Instanz

---

## Lizenz

MIT

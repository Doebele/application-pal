# Application Pal

Persönliches Bewerbungs-Management-Tool mit KI-Unterstützung. Läuft vollständig lokal auf deinem Rechner via Docker — kein Cloud-Account, keine Abo-Kosten, deine Daten bleiben bei dir.

---

## Ansichten

### Board
Kanban-Board mit Drag & Drop durch alle Phasen. Bewerbungskarten zeigen Firma, Rolle, Match-Score, Tags und Anzahl Tage in der aktuellen Phase.

### Liste `/table`
Vollständig konfigurierbare Tabelle aller Bewerbungen mit KI-Kennwerten:
- **15 Spalten** — Unternehmen, Stelle, Phase, Ort, Match, Lohn-Median, Glassdoor ★, Kununu ★, Lohn (Inserat), Quelle, Tags, Beworben, 1. Interview, Erstellt, Aktualisiert
- **Spaltenbreite** — per Drag am rechten Spaltenrand anpassbar (persistiert)
- **Spalten-Reihenfolge** — Drag & Drop der Spaltenheader
- **Spalten ein-/ausblenden** — ⚙ Spalten-Panel
- **Spalten fixieren** — Pin L / Pin R für sticky Spalten beim horizontalen Scrollen
- **KI direkt aus der Tabelle** — jede KI-Spalte (Match, Lohn-Median, Glassdoor, Kununu) hat ein ✦-Icon zum Ausführen, ↺-Icon zum Aktualisieren
- **Horizontales Scrollen** — alle Spalten einblendbar ohne Quetschen

### Kalender `/calendar`
Monats- und Wochenansicht mit Interview-, Deadline- und Follow-up-Events. Filter nach Phase und Typ, URL-persistente Filter-Parameter.

### Profil `/profile`
- **Persona-Auswahl** — Schulabgänger (Schnupperlehre/Ausbildung/Praktikum) · Berufseinsteiger · Berufsumsteiger
- Master-CV, LinkedIn-Bio, persönliche Stichpunkte fliessen in alle KI-Analysen ein
- Wunschgehalt als Referenzlinie in der Gehaltsgrafik
- Markdown-Vorschau für Master-CV und Notizen

### Templates `/templates`
Google Doc Vorlagen-Manager: für jeden KI-Inhaltstyp beliebig viele Templates, eines aktiv. Neues Template erstellen → vollständig formatiertes Google Doc mit `{{PLATZHALTER}}`-Variablen wird in Drive angelegt.

---

## Bewerbungs-Drawer

Öffnet sich beim Klick auf eine Bewerbung. Vier Tabs:

| Tab | Inhalt |
|-----|--------|
| **Aktionen** | Phasen-Checkliste + KI-Aktionsbuttons + Phase-KI-Kacheln + Aktivitäten-Timeline |
| **Details** | Übersichtsfelder · Kontakte · Notizen · Stellenbeschreibung (Markdown, Vorschau/Bearbeiten) |
| **Dokumente** | Google-Drive-Ordner · Vorlagen kopieren · Live-Ordnerinhalt · Bibliothek |
| **KI-Inhalte** | Match-Score-Ring + alle 13 KI-Kacheln (phasenübergreifend) |

### KI-Kacheln

Kompakte Tiles in einem Grid. Jede Kachel zeigt den wichtigsten Kennwert; Klick öffnet die Vollbild-Detailansicht.

| Phase | Kacheln |
|-------|---------|
| Inbox | Glassdoor ★ · Kununu ★ · LinkedIn · Gehalts-Check · ATS-Keywords |
| CV | CV-Highlights |
| Letter | Anschreiben-Review · Eröffnungssätze |
| Sent/Pending | Unternehmensrecherche · Gehaltsverhandlung · Ackermann-Script |
| Interview | Interview-Vorbereitung · Gehaltsverhandlung |
| Accepted | Onboarding-Checkliste |

**Kachel-Design:**
- Gefüllte Kacheln erhalten die Farbe ihrer Bewerbungsphase als Hintergrundton
- Kachelgrösse je nach Inhalt: 1×1 (Zahlen), 2×1 (Text), 3×2 (ATS-Keywords Word Cloud)
- Match-Score: Kreisdiagramm mit Gesamtprozent, Expand → Balken + Stärken/Lücken/Begründung

### ATS-Keywords Word Cloud

- `d3-cloud`-basiertes Layout (gleicher Algorithmus wie Poll Everywhere / Slido)
- Schriftgrösse: Must Have → gross · Nice to Have → mittel · Soft Skills / Tools → klein
- Schriftgewicht 200–800 proportional zur Grösse
- Condensed Font für bessere Dichte
- Expanded View: volle Breite Cloud + 4-Spalten-Kategorieliste mit allen Keywords

### Interview-Vorbereitung (Expanded)

Vollständige Liste aller generierten Fragen mit:
- Kopier-Icon pro einzelne Frage
- Accordion für 4 Kategorien (Rollenspezifisch, Chris Voss, STAR-Beispiele, Rückfragen)
- „Als Google Doc" exportieren (nutzt aktives Template aus `/templates`)

### Ackermann-Script (Expanded)

Gehaltsverhandlung aus **Bewerber-Perspektive** (Verkäufer-Modell):
- Ankergebot ~125% des Zielgehalts (hoch ankern, dann in abnehmenden Schritten zum Ziel)
- Pro Runde: Betrag + Formulierung + Taktik · Kopier-Button pro Formulierung
- Voss-Anker-Formulierung mit eigenem Kopier-Button
- „Als Google Doc" exportieren

---

## KI-Coaching

Alle KI-Ergebnisse werden mit Zeitstempel in der Datenbank gespeichert und beim nächsten Öffnen wiederhergestellt.

### KI-Aktionen nach Phase

**Inbox:**
- Glassdoor / Kununu Rating (KI-Schätzung + editierbare URL)
- LinkedIn Firmenprofil (Mitarbeiterzahl, URL)
- Gehalts-Check Schweiz (Lohnband Min/Median/Max als Balkengrafik mit Wunschgehalt-Linie)
- ATS-Keywords (Must-Have / Nice-to-Have / Soft Skills / Tools)

**CV-Phase:**
- CV-Highlights (relevante Stärken, Keywords, Lücken)
- Google Doc aus Master-CV

**Anschreiben-Phase:**
- Anschreiben generieren / als Google Doc
- Anschreiben reviewen (Ton, Länge, Personalisierung, Klischees)
- 3 alternative Eröffnungssätze

**Beworben / Wartend:**
- Bewerbungs-Email / Follow-up-Email / LinkedIn-Vernetzungsnachricht
- Unternehmensrecherche (Überblick, Kultur, Marktposition, Wettbewerber, aktuelle Themen)
- Ackermann-Verhandlungs-Script

**Interview:**
- Interview-Vorbereitung (Rollenspezifische Fragen, STAR-Beispiele, Chris-Voss-Methode, Rückfragen)
- Gehaltsverhandlungs-Tipps
- Google Kalender-Export / iCal-Download

**Abschluss:**
- Onboarding-Checkliste (30/60/90 Tage)
- Feedback-Email
- Absage-Emails

### Google Doc Export

Alle grösseren KI-Inhalte können als Google Doc exportiert werden. Mit einem aktiven Template aus `/templates` wird das Layout des Templates übernommen — `{{PLATZHALTER}}` werden durch die generierten Inhalte ersetzt, Schriften und Stile bleiben erhalten.

**Template-Ordner in Google Drive:**
- `Pal-Templates/` — alle Google Doc Vorlagen (auto-erstellt)
- `Pal-PDFs/` — alle hochgeladenen PDFs (auto-erstellt)

---

## Google Drive Integration

- Bewerbungsordner pro Stelle automatisch anlegen
- Vorlagen aus dem Master-Ordner kopieren (Stil/Formatierung bleibt erhalten via `files.copy`)
- Live-Ordnerinhalt anzeigen (direkt aus Drive geladen, nicht aus DB-Cache)
- Dateien einzeln löschen (aus Drive + DB)
- Benennungsregeln für Ordner und Dateien konfigurierbar (`{firma}`, `{rolle}`, `{datum}`, etc.)

---

## Dokumente

- **Globale Bibliothek** — Lebenslauf, Zeugnisse, Referenzen, Figma-Links, Portfolio (kategorisiert)
- Bibliotheks-Docs einer Bewerbung zuweisen → automatisch in Drive kopieren (Docs) oder hochladen (PDFs)
- `Drive ✓` Badge nach erfolgreichem Kopieren

---

## Interview-Termin

- Datum, Uhrzeit, Dauer, Format (Vor Ort / Video / Telefon)
- Adresse / Video-URL / Meeting-Code / Anbieter (Zoom, Teams, Google Meet, Andere)
- Gesprächspartner, Notizen
- Google Kalender-Export (URL-Methode, optional mit gespeicherter Kalender-ID)
- iCal-Download (`.ics`) für Apple Kalender, Outlook etc.

---

## Profil & Einstellungen

### Profil
- **Persona** — Schulabgänger · Berufseinsteiger · Berufsumsteiger (beeinflusst KI-Prompts)
- Master-CV mit Markdown-Vorschau
- LinkedIn-Bio, persönliche Stichpunkte
- Wunschgehalt (Referenzlinie in Gehaltsdiagramm)

### Einstellungen
- KI-Anbieter (LM Studio lokal / Anthropic API)
- Dark/Light Theme, Accent-Farbe (Indigo / Violet / Emerald / Amber / Rose)
- Kartenansicht (kompakt / standard / ausführlich / editorial)
- Session-Timeout (15 min bis 30 Tage)
- Google Drive Benennungsregeln
- Google Kalender-ID

---

## Authentifizierung

- E-Mail/Passwort (bcrypt), Google Sign-In, Passkeys (Apple Face ID / Touch ID / Windows Hello)
- „Angemeldet bleiben" — Session-Cookie (beim Schliessen ablaufend) oder 90-Tage-persistenter Cookie
- Konfigurierbarer Session-Timeout
- Passwort-Recovery via E-Mail OTP
- JWT in httpOnly-Cookies (kein localStorage)

---

## Multi-User

Mehrere Nutzer können dieselbe Instanz verwenden — Daten sind vollständig per `user_id` isoliert. Invite-basierte Registrierung: ein bestehender Nutzer generiert einen Einladungslink.

Shared-Token-Fallback für Google Drive: ein Admin verbindet Google einmalig, weitere Nutzer können denselben Account verwenden oder einen eigenen verbinden.

---

## Installation

### Voraussetzungen

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac / Windows) oder Docker + Docker Compose (Linux)

### Schnellstart

```bash
curl -O https://raw.githubusercontent.com/Doebele/application-pal/main/docker-compose.release.yml
curl -O https://raw.githubusercontent.com/Doebele/application-pal/main/.env.example
cp .env.example .env
# .env öffnen → POSTGRES_PASSWORD ändern
docker compose -f docker-compose.release.yml up -d
```

Beim ersten Start dauert es ~1 Minute bis alle Dienste bereit sind.  
Öffne **http://localhost:8070** — das Setup-Formular führt dich durch die erste Registrierung.

### Update

```bash
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

Daten bleiben erhalten (PostgreSQL-Volume wird nicht gelöscht).

---

## Optionale Funktionen

| Funktion | Anleitung |
|----------|-----------|
| Google Drive & Sign-In | [docs/google-setup.md](docs/google-setup.md) |
| KI (LM Studio / Anthropic) | [docs/ai-setup.md](docs/ai-setup.md) |
| Daten-Backup & Migration | [docs/backup.md](docs/backup.md) |

---

## KI-Konfiguration

| Anbieter | Anforderung |
|----------|-------------|
| **LM Studio** (lokal) | LM Studio installieren, Modell laden (empfohlen: Qwen3 14B+) |
| **Anthropic** | API-Key von [console.anthropic.com](https://console.anthropic.com) |

Alle KI-Funktionen sind optional — ohne Konfiguration läuft die App als reines Verwaltungswerkzeug.

---

## Entwickler-Setup

```bash
git clone https://github.com/Doebele/application-pal.git
cd application-pal
cp .env.example .env
docker compose build && docker compose up -d
```

Lokale Entwicklung (Hot-Reload):
```bash
npm install
npm run dev --workspace frontend   # http://localhost:5174
npm run dev --workspace backend    # http://localhost:3000
```

```bash
npm run typecheck --workspace frontend
npm run typecheck --workspace backend
npm run build --workspace shared   # nach Schema-Änderungen
```

Technischer Überblick: [CLAUDE.md](CLAUDE.md)

---

## Tech Stack

| Schicht | Technologie |
|---------|-------------|
| Frontend | React 19 + Vite, TanStack Query, TanStack Table, Zustand, React Router |
| Backend | Hono.js (Bun/Node), Drizzle ORM |
| Datenbank | PostgreSQL 16 |
| KI | LM Studio (lokal) / Anthropic Claude API |
| Drive | Google Drive API v3 + Docs API |
| Auth | JWT (httpOnly-Cookie), bcrypt, WebAuthn (@simplewebauthn) |
| Fonts | Fira Sans · Libre Caslon Text · Fira Mono |
| Icons | Iconoir |
| Deployment | Docker Compose |

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
- Login mit E-Mail/Passwort, Google OAuth oder Passkey (WebAuthn/FIDO2)
- JWT-Token in httpOnly-Cookies (kein localStorage)
- Multi-User mit vollständiger Datenisolation per `user_id`

---

## Lizenz

MIT

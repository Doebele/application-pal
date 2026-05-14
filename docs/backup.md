# Daten sichern & wiederherstellen

Application Pal speichert alle Daten lokal in einer PostgreSQL-Datenbank. Du kannst jederzeit ein vollständiges Backup als JSON-Datei exportieren und auf einem anderen Gerät importieren.

---

## Export (Backup erstellen)

1. Öffne **Settings → Daten & Backup**
2. Klicke **Exportieren**
3. Eine JSON-Datei (`application-pal-export-YYYY-MM-DD.json`) wird heruntergeladen

Das Backup enthält:
- Alle Bewerbungen (inkl. Match-Scores, Notizen, Stage)
- Profilangaben (Master-CV, LinkedIn-Bio, persönliche Stichpunkte)
- Dokumente-Bibliothek
- Aktivitäten & Kontakte pro Bewerbung

**Nicht enthalten**: Google OAuth-Token, Passkey-Credentials (aus Sicherheitsgründen)

---

## Import (Backup wiederherstellen)

1. Öffne **Settings → Daten & Backup**
2. Klicke **Importieren**
3. Wähle die JSON-Export-Datei aus
4. Bestätige den Dialog — **alle bestehenden Daten werden ersetzt**

> ⚠️ Der Import löscht alle aktuellen Daten und ersetzt sie durch die Backup-Daten. Diese Aktion kann nicht rückgängig gemacht werden.

---

## Migration auf neues Gerät

1. Auf altem Gerät: Export erstellen
2. Auf neuem Gerät: Docker installieren + Application Pal starten
3. Account erstellen (Setup-Seite)
4. Import durchführen

---

## Automatisches Backup (optional)

Für regelmässige automatische Backups kannst du einen Cron-Job einrichten:

```bash
# Täglich um 02:00 Uhr exportieren
0 2 * * * curl -s http://localhost:8070/api/export -o ~/backups/app-pal-$(date +\%Y-\%m-\%d).json
```

Stelle sicher, dass du eingeloggt bist (Cookie wird benötigt). Alternativ: PostgreSQL-Dump direkt:

```bash
docker exec application-pal-db pg_dump -U postgres application_pal > backup.sql
```

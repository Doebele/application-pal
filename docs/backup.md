# Backup & Restore

Application Pal stores all data locally in a PostgreSQL database. You can export a complete backup as a JSON file at any time and import it on another device.

---

## Export (Create a Backup)

1. Open **Settings → Data & Backup**
2. Click **Export**
3. A JSON file (`application-pal-export-YYYY-MM-DD.json`) is downloaded

The backup includes:
- All applications (incl. match scores, notes, stage)
- Profile data (Master CV, LinkedIn bio, personal notes)
- Document library
- Activities & contacts per application

**Not included**: Google OAuth tokens, passkey credentials (for security reasons)

---

## Import (Restore a Backup)

1. Open **Settings → Data & Backup**
2. Click **Import**
3. Select the JSON export file
4. Confirm the dialog — **all existing data will be replaced**

> ⚠️ Import deletes all current data and replaces it with the backup data. This action cannot be undone.

---

## Migration to a New Device

1. On the old device: create an export
2. On the new device: install Docker + start Application Pal
3. Create an account (setup page)
4. Run the import

---

## Automated Backup (Optional)

For regular automatic backups you can set up a cron job:

```bash
# Export daily at 02:00
0 2 * * * curl -s http://localhost:8070/api/export -o ~/backups/app-pal-$(date +\%Y-\%m-\%d).json
```

Make sure you are logged in (a cookie is required). Alternatively, take a PostgreSQL dump directly:

```bash
docker exec application-pal-db pg_dump -U postgres application_pal > backup.sql
```

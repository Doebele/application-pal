# Application-Pal

Phase-1-Scaffold fuer Job-Pal mit Hono-Backend, React-Frontend und gemeinsamen Types.

## Schnellstart

1. `.env.example` nach `.env` kopieren.
2. `docker compose up --build` starten.
3. Frontend unter `http://localhost`, Backend-Health unter `http://localhost/health`.

## Production Deployment (STRATO VPS)

1. Repository auf dem VPS klonen.
2. `.env.example` nach `.env` kopieren und Werte setzen (`DATABASE_URL`, `JWT_SECRET`, `PORT` etc.).
3. Container im Hintergrund starten:
   - `docker compose up -d --build`
4. Datenbankmigrationen ausfuehren:
   - `docker compose exec backend npm run db:migrate --workspace backend`
5. Anwendung pruefen:
   - App: `http://<vps-ip>`
   - Backend-Health: `http://<vps-ip>/health`

Hinweis: Der Frontend-Container (Nginx) published Ports `80` und `443`; der Backend-Container bleibt intern und wird ueber Nginx erreichbar gemacht.

Beim ersten Start braucht Postgres bis zu ~2 Minuten fuer Init/Migrations-Jitter bis alle Services `healthy` sind.
Kaputtes Postgres-Volume (symptomatisch z.B. via Migration-/Login-Fehlern): `docker compose down -v` und `.env` erneut pruefen (Datenbank-Inhalt wird dabei geloescht).

## Struktur

- `frontend` - React 19 + Vite + Tailwind + React Router
- `backend` - Hono + TypeScript + Drizzle/PG Skeleton
- `shared` - Zod Schemas und gemeinsame Typen

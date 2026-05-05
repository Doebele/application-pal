# Application-Pal

Phase-1-Scaffold fuer Job-Pal mit Hono-Backend, React-Frontend und gemeinsamen Types.

## Schnellstart

1. `.env.example` nach `.env` kopieren.
2. `docker compose up --build` starten.
3. Frontend unter `http://localhost:5173`, Backend-Health unter `http://localhost:3000/health`.

## Struktur

- `frontend` - React 19 + Vite + Tailwind + React Router
- `backend` - Hono + TypeScript + Drizzle/PG Skeleton
- `shared` - Zod Schemas und gemeinsame Typen

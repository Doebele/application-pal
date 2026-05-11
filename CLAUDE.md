# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Type-check all workspaces
npm run typecheck

# Type-check a single workspace
npm run typecheck --workspace frontend
npm run typecheck --workspace backend

# Dev: full stack via Docker (app on http://localhost:8070)
docker compose up --build

# Dev: Vite frontend only (port 5174, proxies /api → localhost:8070)
npm run dev --workspace frontend

# Dev: backend only with hot-reload (port 3000)
npm run dev --workspace backend

# Rebuild Docker after source changes
docker compose build frontend && docker compose up -d frontend
docker compose build backend  && docker compose up -d backend

# Run DB migrations (inside running container)
docker compose exec backend npm run db:migrate --workspace backend

# Generate new Drizzle migration after schema change
npm run db:generate --workspace backend
```

## Architecture

npm workspaces monorepo with three packages: `shared`, `backend`, `frontend`.

```
shared/src/schema.ts   ← single source of truth: Drizzle tables + Zod schemas + TS types
backend/src/index.ts   ← entire Hono API (all routes in one file, no router splitting)
frontend/src/          ← React 19 + Vite SPA
```

### Data flow

`shared` is built first (`tsc`), then both `backend` and `frontend` import its compiled output.
When adding a new DB column or table: edit `shared/src/schema.ts` → run `db:generate` → add migration SQL to `backend/drizzle/` → run `db:migrate` (or apply SQL directly to the running container with `docker exec`).

### Backend (`backend/src/index.ts`)

Single Hono app, no sub-routers. All endpoints in one file. Uses `drizzle-orm/node-postgres` against Postgres. No ORM migrations at startup — migrations are applied manually via `drizzle-kit migrate`.

Key patterns:
- Route handlers use `zValidator("json", schema)` from `@hono/zod-validator` for request validation
- Zod schemas come from `@application-pal/shared`, never defined in the backend
- AI extraction uses two providers: LM Studio (local, proxied via `/api/lm-studio/models`) and Anthropic claude-haiku — both via fetch, no SDK
- Google OAuth tokens stored in `google_oauth_tokens` table; Clearbit used for company logos

### Frontend (`frontend/src/`)

- **State**: Zustand `useUiStore` (persisted to localStorage) for UI preferences (theme, accent, density, AI config, rail state). Server data via React Query with key `["applications"]`
- **API**: `api` from `lib/api.ts` — plain Axios instance with empty `baseURL` (relies on Vite proxy in dev, nginx in production)
- **Styling**: single `index.css` with CSS custom properties (`--fg-1`, `--accent`, `--surface-2`, etc.). No Tailwind at runtime. `.input-line` for Notion-style underline inputs, `.field` for labelled form fields
- **Expand-Logik**: sections that expand to fill `.app-main` use `position: absolute; top: 57px; left: 0; right: 0; bottom: 0; z-index: 10` — `.app-main` has `position: relative`

### Ports

| Service | Docker port | Dev port |
|---|---|---|
| Frontend (nginx) | 8070 | 5174 (Vite) |
| Backend (Hono) | 8071 | 3000 |
| Postgres | 15436 | — |

Vite dev server proxies `/api` → `http://localhost:8070` (nginx), which in turn proxies to the backend container. The `BACKEND_PORT` env var is injected into nginx via `sed` in the frontend Dockerfile to replace `__BACKEND_PORT__` in `nginx.conf`.

### DB tables

| Table | Purpose |
|---|---|
| `applications` | Core job applications with stage, tags, salary, logoUrl |
| `user_profile` | Single-row personal profile + Master-CV |
| `user_documents` | Global document library (Zeugnisse, Figma links, etc.) |
| `application_documents` | Per-application CV/letter docs; `userDocumentId` links to library |
| `application_activities` | Timeline events per application |
| `application_contacts` | Contacts per application |
| `google_oauth_tokens` | Google Drive OAuth token (single row) |

### Google OAuth

Flow: Settings → `/api/google/auth-url` → Google consent → `/api/google/callback` → token stored in DB. Redirect target controlled by `GOOGLE_FRONTEND_URL` env var (default: `http://localhost:8070`). The redirect URI registered in Google Cloud Console must match `GOOGLE_REDIRECT_URI` in `.env`.

### After Docker changes

After editing source files, Docker images need explicit rebuilds — the containers do **not** hot-reload from the host filesystem. Always run `docker compose build <service> && docker compose up -d <service>` after changes. TypeScript errors that the Vite dev server ignores will **fail** the Docker build (`tsc -b` runs in the Dockerfile).

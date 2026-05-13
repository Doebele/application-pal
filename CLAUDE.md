# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Type-check all workspaces
npm run typecheck

# Type-check a single workspace
npm run typecheck --workspace frontend
npm run typecheck --workspace backend

# Dev: Vite frontend only (port 5174, proxies /api → localhost:8070)
npm run dev --workspace frontend

# Dev: backend only with hot-reload (port 3000)
npm run dev --workspace backend

# Rebuild Docker after source changes — always required, containers do NOT hot-reload
cd /Users/clausmedvesek/Developer/projects/application-pal
docker compose build frontend && docker compose up -d frontend
docker compose build backend  && docker compose up -d backend

# Apply DB migration manually to running container
docker exec application-pal-db psql -U postgres -d application_pal -c "ALTER TABLE ..."

# Generate new Drizzle migration file after schema change
npm run db:generate --workspace backend
```

## Critical Pitfalls

**Stale JS artifacts**: If `frontend/src/` contains `.js` files (e.g. `App.js`, `main.js`), Vite resolves them before `.tsx` and serves old compiled code. Delete any such files immediately.

**Docker TypeScript errors**: `tsc -b` runs inside the Dockerfile — errors the Vite dev server ignores will break the Docker build. Always run `npm run typecheck` before rebuilding Docker.

**Preview server directory**: The preview tool starts Vite from `.claude/launch.json`. The `launch.json` in both the main project and any worktrees must use `sh -c "cd /abs/path && npm run dev --workspace frontend"` to ensure the correct source is served.

**Schema changes**: Edit `shared/src/schema.ts` → run `npm run build --workspace shared` to compile → then typecheck passes. DB migrations must be applied manually with `docker exec` (no auto-migration on startup).

## Architecture

npm workspaces monorepo: `shared`, `backend`, `frontend`.

```
shared/src/schema.ts   ← single source of truth: Drizzle tables + Zod schemas + TS types
backend/src/index.ts   ← entire Hono API (all routes in one file, no sub-routers)
frontend/src/          ← React 19 + Vite SPA
```

### Data flow

`shared` compiles first (`tsc`). Both `backend` and `frontend` import from `@application-pal/shared`.

### Backend (`backend/src/index.ts`)

Single Hono app. All routes in one file. Uses `drizzle-orm/node-postgres`. No auto-migrations.

Key patterns:
- Validation: `zValidator("json", schema)` from `@hono/zod-validator`; schemas from `@application-pal/shared` only
- AI extraction: LM Studio + Anthropic claude-haiku via raw `fetch`, no SDK
- `pickWorkTags(text)`: regex-detects Remote/Hybrid/On-site and work-time % from job text, appended to AI tags
- `resolveCompanyLogo(name)`: queries Clearbit autocomplete for domain, returns `https://www.google.com/s2/favicons?domain=X&sz=128` (Clearbit logo service is defunct)
- Export: `GET /api/export` returns all tables as JSON; `POST /api/import` with `{mode, data}` restores them

### Frontend (`frontend/src/`)

- **State**: Zustand `useUiStore` (persisted to localStorage) — theme, accent, density, AI config. Server data via React Query `["applications"]` and `["applications", showArchived]`
- **API**: `api` from `lib/api.ts` — Axios with empty `baseURL`
- **Styling**: single `index.css`, CSS custom properties. No Tailwind. `.input-line` = Notion-style underline input (no box). `.field` = labelled form field (gap 1px, padding 2px 0)
- **Expand-Logik**: expandable sections use `position: absolute; top: 57px; left/right/bottom: 0; z-index: 10` within `.app-main` (`position: relative`)

### Ports & Container Names

| Service | Docker port | Container name | Dev port |
|---|---|---|---|
| Frontend (nginx) | 8070 | `application-pal-frontend` | 5174 (Vite) |
| Backend (Hono) | 8071 | `application-pal-backend` | 3000 |
| Postgres | 15436 | `application-pal-db` | — |

Vite dev proxies `/api` → `http://localhost:8070` (nginx) → backend container internally.

### DB Tables

| Table | Purpose |
|---|---|
| `applications` | Jobs: stage, tags, salary, logoUrl, archived |
| `user_profile` | Single-row profile + Master-CV |
| `user_documents` | Global document library (Zeugnisse, Figma, etc.) |
| `application_documents` | Per-job docs; `userDocumentId` links to library |
| `application_activities` | Timeline events per job |
| `application_contacts` | Contacts per job |
| `google_oauth_tokens` | Google Drive OAuth token (single row) |

**Archive pattern**: `applications.archived = "true"` hides from main board. `GET /api/applications?archived=true` fetches archived. Default query filters `archived != "true"`.

### Key Frontend Patterns

**DetailDrawer state lifting**: `stage` and `url` are lifted to `DetailDrawer` so the header Stage-Picker and Job-button update immediately when edited in `OverviewTab`.

**Board filter**: `BoardPage` manages `visibleStages: string[]` (empty = all). Passed to `Board` which filters its `STAGES` array. `FilterDropdown` in the Topbar actions handles multi-select.

**Logo avatar**: `LogoAvatar` in `DetailDrawer` and `Avatar` in `Card.tsx` both try loading `logoUrl` via `<img>` with `onError` fallback to colored initials. Google Favicon URLs (`/s2/favicons?domain=X&sz=128`) may 301-redirect but browsers follow automatically.

### Google OAuth

Flow: Settings → `/api/google/auth-url` → consent → `/api/google/callback` → DB. `GOOGLE_FRONTEND_URL` controls redirect target (default `http://localhost:8070`). Must match registered URI in Google Cloud Console.

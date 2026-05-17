# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Type-check all workspaces
npm run typecheck

# Type-check a single workspace
npm run typecheck --workspace frontend
npm run typecheck --workspace backend

# Build shared package (required after schema changes before typecheck passes)
npm run build --workspace shared

# Dev: Vite frontend only (port 5174, proxies /api → localhost:8070)
npm run dev --workspace frontend

# Dev: backend only with hot-reload (port 3000)
npm run dev --workspace backend

# Rebuild Docker after source changes — always required, containers do NOT hot-reload
# MUST run from project root (not a worktree) — build context '.' must point at the monorepo
cd /Users/clausmedvesek/Developer/projects/application-pal
docker build -t application-pal-frontend -f frontend/Dockerfile . && \
  docker compose -f docker-compose.yml --env-file .env up -d frontend
docker build -t application-pal-backend  -f backend/Dockerfile  . && \
  docker compose -f docker-compose.yml --env-file .env up -d backend

# Apply DB migration manually to running container
docker exec application-pal-db psql -U postgres -d application_pal -c "ALTER TABLE ..."
```

## Critical Pitfalls

**Stale JS artifacts**: If `frontend/src/` contains `.js` files (e.g. `App.js`, `main.js`), Vite resolves them before `.tsx` and serves old compiled code. Delete any such files immediately.

**Docker TypeScript errors**: `tsc -b` runs inside the Dockerfile — errors the Vite dev server ignores will break the Docker build. Always run `npm run typecheck` before rebuilding Docker.

**Schema changes**: Edit `shared/src/schema.ts` → run `npm run build --workspace shared` → then typecheck passes. DB migrations must be applied manually with `docker exec` (no auto-migration on startup).

**LM Studio in Docker**: The backend runs inside Docker. `localhost:1234` inside Docker ≠ the host machine. `resolveHostUrl()` in `backend/src/index.ts` rewrites `localhost` → `host.docker.internal` for all LM Studio calls. Never hardcode `localhost` for LM Studio URLs.

**Qwen3 max_tokens**: Always set `max_tokens: 32768` for LM Studio calls (doubled). Qwen3 emits a long `<think>…</think>` block before the JSON answer. `extractJson()` strips `<think>` blocks before parsing.

**nginx proxy timeout**: `frontend/nginx.conf` sets `proxy_read_timeout 360s`. AI endpoints can take up to 240s. Never reduce this timeout.

**Preview server directory**: `.claude/launch.json` must use `sh -c "cd /abs/path && npm run dev --workspace frontend"` so the preview tool serves the main project, not a worktree.

**axios withCredentials**: `frontend/src/lib/api.ts` sets `withCredentials: true`. This is required for the httpOnly auth cookies to be sent with every API request. Never remove this.

**Docker working directory**: Always `cd /Users/clausmedvesek/Developer/projects/application-pal` before any Docker command. The CWD persists between Bash calls and may drift to a worktree. Building from a worktree compiles the wrong source — the running container will serve stale code with no error. Use `docker build -t ... -f .../Dockerfile .` (explicit tag + Dockerfile path) instead of `docker compose build` to avoid silent wrong-context builds.

**After Docker rebuild, verify content**: Run `docker exec application-pal-frontend grep -r "SomeNewString" /usr/share/nginx/html/assets/` to confirm the newly written code is actually in the bundle.

## Architecture

npm workspaces monorepo: `shared`, `backend`, `frontend`.

```
shared/src/schema.ts   ← single source of truth: Drizzle tables + Zod schemas + TS types
backend/src/index.ts   ← entire Hono API (all routes in one file, no sub-routers, ~2600 lines)
frontend/src/          ← React 19 + Vite SPA
```

### Data flow

`shared` compiles first (`tsc`). Both `backend` and `frontend` import from `@application-pal/shared`.

### Backend (`backend/src/index.ts`)

Single Hono app. All routes in one file. Uses `drizzle-orm/node-postgres`. No auto-migrations.

**Key helper functions** (defined before routes):
- `resolveHostUrl(url)` — rewrites `localhost` → `host.docker.internal` for Docker networking
- `getJwtSecret()` — returns JWT secret; auto-generates ephemeral secret if `JWT_SECRET` env is empty
- `issueTokens(c, userId, rememberMe, accessTimeout)` — sets `access_token` (lifetime from `user_profile.session_timeout`, default 15min) + `refresh_token` (session or 90d) as httpOnly cookies
- `getSessionTimeout()` — reads `user_profile.session_timeout`; called by all auth routes before `issueTokens()`
- `SESSION_TIMEOUT_SECONDS` — map of timeout string → seconds: `"15m"|"1h"|"6h"|"24h"|"7d"|"30d"`
- `STAGE_TASK_TEMPLATES` — predefined task lists per stage; `initTasksForStage(appId, stage)` inserts them (idempotent, no duplicates)
- `callAi(system, user, ai)` — generic AI caller for LM Studio or Anthropic; used by all coaching endpoints
- `extractJson(raw)` — strips `<think>` blocks + markdown fences, returns parsed JSON
- `applyNameRule(rule, vars)` — replaces `{firma}`, `{rolle}`, `{datum}` etc. in Drive naming rules
- `buildExportPayload()` — assembles all user-data tables for export; used by both download and Drive-save endpoints
- `getDriveAccessToken()` — retrieves stored Google OAuth access token from DB

**Validation**: `zValidator("json", schema)` from `@hono/zod-validator`; schemas from `@application-pal/shared` only.

**Auth middleware** (runs before all `/api/*` except `/api/auth/*`, `/api/google/callback`, `/health`):
Verifies `access_token` cookie via JWT; silently refreshes via `refresh_token` cookie if access token expired.

**Stage-change hook**: `PATCH /api/applications/:id` detects stage changes → calls `initTasksForStage()` and logs a `stage_change` activity automatically.

### Frontend (`frontend/src/`)

- **State**: Zustand `useUiStore` (persisted localStorage, key `app-pal-ui-v2`) — theme, accent, density, cardVariant, AI config, Drive naming rules (`driveNameFolder`, `driveNameDoc`), Drive parent folder ID (`driveApplicationsFolderId`)
- **Auth**: `AuthProvider` + `useAuth()` in `lib/auth.tsx`. Calls `/api/auth/me` on mount. No token in localStorage — cookies are httpOnly. All routes wrapped in `ProtectedRoute` in `App.tsx`.
- **API**: `api` from `lib/api.ts` — Axios, `withCredentials: true`, empty `baseURL`
- **Styling**: single `index.css`, CSS custom properties. No Tailwind. `.input-line` = Notion-style underline input. `.field` = labelled form field. `.hide-scrollbar` = cross-browser scrollbar hiding.
- **Expand-Logik**: expandable sections use `position: absolute; top: 57px; left/right/bottom: 0; z-index: 10` within `.app-main` (`position: relative`)

### Ports & Container Names

| Service | Docker port | Container name | Dev port |
|---|---|---|---|
| Frontend (nginx) | 8070 | `application-pal-frontend` | 5174 (Vite) |
| Backend (Hono) | 8071 | `application-pal-backend` | 3000 |
| Postgres | 15436 | `application-pal-db` | — |

### DB Tables

| Table | Purpose | Exported |
|---|---|---|
| `applications` | Jobs: stage, tags, salary, logoUrl, archived, archiveReason, matchScore, matchDetails, googleFolderId, googleFolderUrl, portalUrl, interview1Details, interview2Details, interview1Prep, interview2Prep, glassdoorData | ✅ |
| `user_profile` | Single-row profile: masterCv, linkedinBio, headline, personalNotes, googleCalendarId, sessionTimeout | ✅ |
| `user_documents` | Global document library (CV, Zeugnisse, Figma, etc.) | ✅ |
| `application_documents` | Per-job docs; `userDocumentId` links to library; `googleDocId`/`googleDocUrl` for Drive | ✅ |
| `application_activities` | Timeline events per job | ✅ |
| `application_contacts` | Contacts per job | ✅ |
| `application_tasks` | Stage-specific checklists per job; `isDefault` = auto-created, `stage` = which phase | ✅ |
| `users` | Single user account (email + bcrypt hash) | ❌ auth data |
| `webauthn_credentials` | Passkey/WebAuthn credentials per user | ❌ auth data |
| `password_reset_tokens` | OTP codes for password recovery | ❌ auth data |
| `google_oauth_tokens` | Google Drive/Docs OAuth token (single row) | ❌ credentials |
| `kb_companies`, `kb_roles`, `kb_sources`, `kb_insights` | Knowledge-base cache | ❌ auto-generated |

**Archive pattern**: `applications.archived = "true"` hides from board. `archived != "true"` is the default filter. `archiveReason` stores one of `unavailable | irrelevant | taken | other` or free text.

### Export/Import rules

`GET /api/export` uses `db.select().from(table)` with no column list → new columns are automatically included. When adding a new user-data **table**, add it to both `/api/export` (via `buildExportPayload()`) and `/api/import`. Never export `users`, `webauthn_credentials`, `password_reset_tokens`, `googleOAuthTokens`, or `kb_*` tables. Version = 1; only bump on breaking structural changes.

### AI Endpoints (all require `{ ai: AiConfig }` body)

All use `callAi()` + `extractJson()` pattern, `resolveHostUrl()`, and `max_tokens: 32768` for LM Studio.

| Endpoint | Returns |
|---|---|
| `POST /api/applications/:id/match-score` | `{ score, breakdown, staerken, luecken, reasoning }` |
| `POST /api/applications/:id/ai/cv-highlights` | `{ highlights, keywords, gaps }` |
| `POST /api/applications/:id/ai/cv-doc` | Creates Google Doc from Master-CV + highlights; returns `{ docUrl }` |
| `POST /api/applications/:id/ai/cover-letter` | `{ subject, body, docUrl? }` — `createDoc: true` also creates Google Doc |
| `POST /api/applications/:id/ai/email-draft` | `{ subject, body }` — body: `{ type: "application"|"followup"|"decline"|"feedback"|"linkedin" }` |
| `POST /api/applications/:id/ai/interview-prep` | `{ rollenFragen, starBeispiele, vossFragenWhatHow, rueckfragen }` — result persisted to `interview1Prep`/`interview2Prep` |
| `POST /api/applications/:id/ai/interview-prep/export-doc` | Creates Google Doc from interview prep; body: `{ interviewPrep }`; returns `{ docUrl }` |
| `POST /api/applications/:id/ai/salary-tips` | `{ markteinschätzung, taktiken, formulierungen, vossAnker }` |
| `POST /api/applications/:id/ai/salary-check` | `{ band, median, begründung, quellen }` — Swiss salary estimate for the role |
| `POST /api/applications/:id/ai/ats-keywords` | `{ mustHave, niceToHave, softSkills }` |
| `POST /api/applications/:id/ai/company-research` | `{ überblick, kultur, news, markt, wettbewerber }` |
| `POST /api/applications/:id/ai/ackermann-script` | `{ anker, schritte, formulierungen }` — Ackermann salary negotiation script |
| `POST /api/applications/:id/ai/letter-review` | `{ bewertung, verbesserungen, alternativen }` |
| `POST /api/applications/:id/ai/opening-sentences` | `{ sätze: string[] }` — 3 alternative cover letter openers |
| `POST /api/applications/:id/ai/onboarding` | `{ tage30, tage60, tage90, allgemein }` |
| `POST /api/applications/:id/ai/glassdoor-check` | `{ rating, reviewCount, ceoApproval, recommendToFriend, confidence, summary, pros, cons, hinweis, glassdoorUrl, kununuUrl, linkedinUrl, updatedAt }` — AI estimate from training data; persisted to `glassdoor_data` |
| `PATCH /api/applications/:id/ai/glassdoor-check` | Manual override for `rating` + `reviewCount`; body: `{ rating?, reviewCount? }` |

### Google Drive Endpoints

All require Google OAuth token in DB (`drive` scope — NOT `drive.file`).

| Endpoint | Function |
|---|---|
| `POST /api/applications/:id/drive/init-folder` | Creates Drive folder; body `{ folderRule?, parentFolderId? }` |
| `GET /api/drive/templates` | Lists files from `GOOGLE_MASTER_FOLDER_ID`; filters to docs/sheets/PDFs only |
| `POST /api/applications/:id/drive/copy-template` | Copies master-folder file to app folder; fallback: export-as-docx → reupload |
| `POST /api/applications/:id/drive/copy-doc` | Copies a user-library Google Doc to app folder; same fallback |
| `GET /api/drive/folder-info?folderId=` | Validates a folder ID and returns its name |
| `POST /api/export/drive` | Saves JSON backup to Drive root as `application-pal-backup-YYYY-MM-DD.json` |
| `GET /api/applications/:id/drive/files` | Lists live Drive folder contents (no subfolders) |
| `DELETE /api/applications/:id/drive/files/:fileId` | Deletes file from Drive + removes from `applicationDocuments` |
| `POST /api/applications/:id/drive/upload-pdf-from-url` | Downloads PDF from URL (or Drive with auth) and uploads to app folder |

**Drive naming rules** (`applyNameRule`): placeholders `{firma}`, `{rolle}`, `{name}`, `{datum}` (YYMMDD), `{jahr}`, `{monat}`, `{doc}`. Defaults: folder = `{firma} – {rolle} – {datum}`, doc = `{doc} – {name} – {firma} – {datum}`. Stored in `useUiStore` (`driveNameFolder`, `driveNameDoc`). Parent folder stored as `driveApplicationsFolderId` in store; sent as `parentFolderId` in `init-folder` request.

### Key Frontend Patterns

**DetailDrawer**: The main job detail view. `stage` and `url` are lifted to `DetailDrawer` component state so the header Stage-Picker updates immediately. Tab type: `"process" | "details" | "documents" | "insights" | "contacts" | "notes"`. Default tab is `"process"`.

**ProcessTab**: Sections top-to-bottom: `InterviewDetailsPanel` (only for `interview_1`/`interview_2`) → `TaskChecklist` → `StageAiActions` → `GlassdoorPanel` (only when `aiGlassdoor` state is set, inbox stage) → KI-generated content blocks → activity timeline. `ProcessTab` receives `onSave` and passes it to both `InterviewDetailsPanel` and `StageAiActions`. `StageAiActions` only renders for stages with relevant actions.

**DetailsTab**: Merges the former OverviewTab and DescriptionTab. Top half = overview fields (company, role, salary, location, etc.). Bottom = Stellenbeschreibung rendered via `react-markdown` + `remark-gfm` with a Vorschau/Bearbeiten toggle (`descMode` state). Links open in `target="_blank"`. Autosave on `onBlur` in Bearbeiten mode. Styled via `.md-body` CSS class in `index.css`.

**InterviewDetailsPanel**: Renders in ProcessTab for interview stages. Fields: date, time, duration, format (onsite/video/phone), address or video URL/code/provider, interviewer, notes. Autosave on blur. "Google Kalender" button uses URL method (`calendar.google.com/calendar/r/eventedit?...`) with optional `calid` from `user_profile.googleCalendarId`. "iCal herunterladen" generates a `.ics` file client-side.

**StageAiActions**: For interview stages, interview prep is initialized from `app.interview1Prep`/`app.interview2Prep` (JSON.parse). After generation, persisted to DB via `onSave()`. "Alles kopieren" and "Als Google Doc" buttons appear inline next to "Neu generieren". Receives `onGlassdoorChange` callback for the inbox glassdoor action.

**GlassdoorPanel**: Renders when `glassdoorData` is set (parsed from `app.glassdoorData` JSON). Shows rating stars, CEO approval %, recommend %, pros/cons grid, confidence badge, editable rating + review count inputs (underline style), and direct links to Glassdoor/Kununu/LinkedIn. PATCH call on manual save. All three link URLs are constructed server-side from the company name and stored in the JSON. `glassdoor_data` stores the full `GlassdoorData` JSON object as a TEXT column.

**DocumentsTab**: Three sections: Google Drive folder panel (top, only if connected) → Zugewiesen list → library grid (2-column). Library docs show 3 states: not linked / linked-no-Drive / linked-with-Drive-copy. Adding a Google Doc from library auto-copies to Drive folder if one exists.

**Board filters** (`BoardPage`): `visibleStages[]` + `timeFilter` (TimeFilter type) for the main board; `reasonFilter` (ReasonFilter) + `archiveTime` for the archive view. All filtering is client-side after fetch.

**Logo avatar**: `LogoAvatar` in `DetailDrawer` and `Avatar` in `Card.tsx` try `logoUrl` via `<img>` with `onError` fallback to colored initials.

### Authentication

Single-user design. JWT in httpOnly cookies (no localStorage). `GET /api/auth/status` returns `{ setup: bool }` — if `false`, SetupPage is shown. Google Sign-In doubles as Drive authorization (one OAuth consent for both). WebAuthn passkeys supported via `@simplewebauthn/server` with `requireUserVerification: false` for broad authenticator compatibility.

**Session timeout** is configurable per user (Settings → Sicherheit): 15m / 1h / 6h / 24h / 7d / 30d. Stored in `user_profile.session_timeout`. All auth routes call `getSessionTimeout()` before `issueTokens()`. Access token `maxAge` is set accordingly. **Remember-me** checkbox on login: unchecked = session refresh cookie (no `maxAge`), checked = 90-day persistent refresh cookie.

### Google OAuth

Scope required: `https://www.googleapis.com/auth/drive` (NOT `drive.file`) + `documents` + `openid email profile`. The broader `drive` scope is needed to copy user-owned template files. Re-authentication is required when upgrading from older `drive.file` scope. Flow: Settings → `/api/google/auth-url` → consent → `/api/google/callback` → DB + auto-login.

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
- `getSessionTimeout(userId?)` — reads `user_profile.session_timeout` for a specific user; called by all auth routes before `issueTokens()`
- `getUserId(c)` — extracts authenticated `userId` from Hono context (`c.get("userId")`); use in every protected route
- `SESSION_TIMEOUT_SECONDS` — map of timeout string → seconds: `"15m"|"1h"|"6h"|"24h"|"7d"|"30d"`
- `STAGE_TASK_TEMPLATES` — predefined task lists per stage; `initTasksForStage(appId, stage)` inserts them (idempotent, no duplicates)
- `callAi(system, user, ai)` — generic AI caller for LM Studio or Anthropic; used by all coaching endpoints
- `extractJson(raw)` — strips `<think>` blocks + markdown fences, returns parsed JSON
- `applyNameRule(rule, vars)` — replaces `{firma}`, `{rolle}`, `{datum}` etc. in Drive naming rules
- `buildExportPayload(userId)` — assembles all user-data tables for a specific user; used by both download and Drive-save endpoints
- `getDriveAccessToken(userId?)` — retrieves Google OAuth token: user-specific first, falls back to shared token (user_id IS NULL)

**Validation**: `zValidator("json", schema)` from `@hono/zod-validator`; schemas from `@application-pal/shared` only.

**Auth middleware** (runs before all `/api/*` except `/api/auth/*`, `/api/google/callback`, `/health`):
Verifies `access_token` cookie via JWT; silently refreshes via `refresh_token` cookie if access token expired.

**Stage-change hook**: `PATCH /api/applications/:id` detects stage changes → calls `initTasksForStage()` and logs a `stage_change` activity automatically.

### Frontend (`frontend/src/`)

- **State**: Zustand `useUiStore` (persisted localStorage, key `app-pal-ui-v2`) — theme, accent, density, cardVariant, AI config, Drive naming rules (`driveNameFolder`, `driveNameDoc`). **Note**: `driveApplicationsFolderId` was removed from Zustand — now stored per-user in `user_profile.drive_applications_folder_id` (load via `GET /api/profile`).
- **Auth**: `AuthProvider` + `useAuth()` in `lib/auth.tsx`. Calls `/api/auth/me` on mount. No token in localStorage — cookies are httpOnly. All routes wrapped in `ProtectedRoute` in `App.tsx`.
- **API**: `api` from `lib/api.ts` — Axios, `withCredentials: true`, empty `baseURL`
- **Styling**: single `index.css`, CSS custom properties. No Tailwind. `.input-line` = Notion-style underline input. `.field` = labelled form field. `.hide-scrollbar` = cross-browser scrollbar hiding.
- **Expand-Logik**: expandable sections use `position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 10` within `.drawer-body` which has `position: relative`. Do NOT use `top: 57` — the drawer is `position: fixed` so that was relative to the drawer top (covering header). The correct containing block is `drawer-body`.

### Ports & Container Names

| Service | Docker port | Container name | Dev port |
|---|---|---|---|
| Frontend (nginx) | 8070 | `application-pal-frontend` | 5174 (Vite) |
| Backend (Hono) | 8071 | `application-pal-backend` | 3000 |
| Postgres | 15436 | `application-pal-db` | — |

### DB Tables

| Table | Purpose | User-isolated | Exported |
|---|---|---|---|
| `applications` | Jobs: stage, tags, salary, logoUrl, archived, archiveReason, matchScore, matchDetails, googleFolderId, interview1/2Details, interview1/2Prep, glassdoorData, kununuData, linkedinData, aiResultsCache | ✅ `user_id` FK | ✅ |
| `user_profile` | Per-user profile: masterCv, linkedinBio, headline, personalNotes, googleCalendarId, driveApplicationsFolderId, sessionTimeout, desiredSalary | ✅ `user_id` FK | ✅ |
| `user_documents` | Per-user document library (CV, Zeugnisse, Figma, etc.) | ✅ `user_id` FK | ✅ |
| `application_documents` | Per-job docs; isolated via `application_id` → `applications.user_id` | via FK | ✅ |
| `application_activities` | Timeline events per job | via FK | ✅ |
| `application_contacts` | Contacts per job | via FK | ✅ |
| `application_tasks` | Stage-specific checklists per job | ✅ `user_id` FK | ✅ |
| `users` | User accounts (email + bcrypt hash); multiple users supported via invite system | — | ❌ auth |
| `invites` | Invite tokens; `created_by` FK; `used` flag; optional `email` restriction + `expires_at` | — | ❌ auth |
| `webauthn_credentials` | Passkey/WebAuthn credentials per user | `user_id` FK | ❌ auth |
| `password_reset_tokens` | OTP codes for password recovery | `user_id` FK | ❌ auth |
| `google_oauth_tokens` | Google OAuth token; `user_id` nullable — NULL = shared admin token, non-null = user-specific | `user_id` (nullable) | ❌ credentials |
| `kb_companies`, `kb_roles`, `kb_sources`, `kb_insights` | Knowledge-base cache (shared across users) | ❌ shared | ❌ auto-generated |

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
| `POST /api/applications/:id/ai/salary-check` | `{ lohnband: {min,max,median}, waehrung, basis, begruendung, faktoren }` — persisted to `aiResultsCache` |
| `POST /api/applications/:id/ai/ats-keywords` | `{ mustHave, niceToHave, softSkills, tools }` — persisted to `aiResultsCache` |
| `POST /api/applications/:id/ai/company-research` | `{ unternehmensueberblick, branche, marktposition, unternehmenskultur, wettbewerber, aktuelleThemen }` |
| `POST /api/applications/:id/ai/ackermann-script` | `{ zielgehalt, ankergebot, schritte[], nichtmonetaer[], vossAnker }` |
| `POST /api/applications/:id/ai/letter-review` | `{ gesamteindruck, staerken, verbesserungen, cliches, tonalitaet, laenge, personalisierung }` |
| `POST /api/applications/:id/ai/opening-sentences` | `{ saetze: [{satz, ansatz, erklaerung}] }` — 3 alternative cover letter openers |
| `POST /api/applications/:id/ai/onboarding` | `{ erste30Tage, erste60Tage, erste90Tage, allgemein }` |
| `POST /api/applications/:id/ai/glassdoor-check` | `{ rating, reviewCount, ceoApproval, recommendToFriend, confidence, summary, pros, cons, hinweis, glassdoorUrl, updatedAt }` — persisted to `glassdoor_data` |
| `PATCH /api/applications/:id/ai/glassdoor-check` | URL update; body: `{ rating?, reviewCount?, glassdoorUrl? }` |
| `POST /api/applications/:id/ai/kununu-check` | `{ rating, reviewCount, confidence, summary, hinweis, url, updatedAt }` — persisted to `kununu_data` |
| `PATCH /api/applications/:id/ai/kununu-check` | URL/rating update; body: `{ rating?, reviewCount?, url? }` |
| `POST /api/applications/:id/ai/linkedin-profile` | `{ url, employeeCount, description, hinweis, updatedAt }` — persisted to `linkedin_data` |
| `PATCH /api/applications/:id/ai/linkedin-profile` | URL update; body: `{ url? }` |

**AI Result Cache**: All AI endpoints (except glassdoor/kununu/linkedin which have dedicated columns) call `persistAiResult(appId, key, data)` which stores results in `applications.aiResultsCache` (JSON `{ [actionId]: { ...data, _savedAt: ISO } }`). On drawer open, `resultTimes` and `aiResultsRegistry` are initialized from this cache → checkmarks restored without re-running.

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

**Drive naming rules** (`applyNameRule`): placeholders `{firma}`, `{rolle}`, `{name}`, `{datum}` (YYMMDD), `{jahr}`, `{monat}`, `{doc}`. Defaults: folder = `{firma} – {rolle} – {datum}`, doc = `{doc} – {name} – {firma} – {datum}`. Stored in `useUiStore` (`driveNameFolder`, `driveNameDoc`). Parent folder (`driveApplicationsFolderId`) is per-user in `user_profile.drive_applications_folder_id` — load via `GET /api/profile`; send as `parentFolderId` in `init-folder` request.

### Google Calendar Endpoints

Require `calendar.readonly` OAuth scope (included in `GOOGLE_SCOPES`). Users must re-connect Google after scope was added.

| Endpoint | Function |
|---|---|
| `GET /api/google/calendar/status` | Returns `{ connected, hasCalendarScope }` — checks stored scope string |
| `GET /api/google/calendar/list` | Lists all calendars from Google Calendar API |
| `GET /api/google/calendar/events?calendarId=&from=&to=` | Fetches events for a calendar and date range |
| `GET /api/calendar/events?from=&to=` | Aggregated app activities + JOIN applications, filtered by `userId` |

### Key Frontend Patterns

**DetailDrawer**: The main job detail view. `stage` and `url` are lifted to `DetailDrawer` component state so the header Stage-Picker updates immediately. Tab type: `"process" | "details" | "documents" | "insights" | "contacts" | "notes"`. Default tab is `"process"`.

**ProcessTab**: Sections top-to-bottom: `InterviewDetailsPanel` (only for `interview_1`/`interview_2`) → `TaskChecklist` → `StageAiActions` → `GlassdoorPanel` (only when `aiGlassdoor` state is set, inbox stage) → KI-generated content blocks → activity timeline. `ProcessTab` receives `onSave` and passes it to both `InterviewDetailsPanel` and `StageAiActions`. `StageAiActions` only renders for stages with relevant actions.

**DetailsTab**: Merges the former OverviewTab and DescriptionTab. Top half = overview fields (company, role, salary, location, etc.). Bottom = Stellenbeschreibung rendered via `react-markdown` + `remark-gfm` with a Vorschau/Bearbeiten toggle (`descMode` state). Links open in `target="_blank"`. Autosave on `onBlur` in Bearbeiten mode. Styled via `.md-body` CSS class in `index.css`.

**InterviewDetailsPanel**: Renders in ProcessTab for interview stages. Fields: date, time, duration, format (onsite/video/phone), address or video URL/code/provider, interviewer, notes. Autosave on blur. "Google Kalender" button uses URL method (`calendar.google.com/calendar/r/eventedit?...`) with optional `calid` from `user_profile.googleCalendarId`. "iCal herunterladen" generates a `.ics` file client-side.

**StageAiActions**: For interview stages, interview prep is initialized from `app.interview1Prep`/`app.interview2Prep` (JSON.parse). After generation, persisted to DB via `onSave()`. "Alles kopieren" and "Als Google Doc" buttons appear inline next to "Neu generieren". Receives `onGlassdoorChange` callback for the inbox glassdoor action.

**StageProgressBar**: Progress bar forks at the end — 7 linear stages (Inbox → 2nd Itw) then a Y-split: `Contract offer` (top, = `accepted`) and `Rejected` (bottom). Vertical stem + two horizontal branches with the same past/active/future color logic.

**GlassdoorPanel** (Aktionen-Tab, Inbox stage): Renders when `glassdoorData` is set. Shows rating stars, CEO approval %, recommend %, pros/cons grid, confidence badge. Header-right: editable glassdoor URL with Open (↗) + Refresh (↺) buttons that PATCH `glassdoor_data`. Kununu/LinkedIn links removed (they have their own dedicated KI action tiles).

**KI-Erkenntnisse (DetailsTab)**: Always-visible tile grid — `STAGE_TILES` mapping in DetailsTab determines which tile IDs are shown for the current stage (e.g. Inbox: glassdoor-check, kununu-check, linkedin-profile, salary-check, ats-keywords). Tiles with no data show an empty state ("Bewertung ermitteln" etc.). Grid: `repeat(auto-fill, minmax(140px, 1fr))`, `grid-auto-flow: dense`. Double-width tiles (`span 2`) for text-heavy results. Tile design: label centered top (fg-3), `Expand` icon top-right (accent), content centered (no check icon, no arrow). Click → `TileExpandView` (full-screen overlay in `drawer-body`).

**AiResultTile**: Figma-style tile. `borderRadius: 12`, `minHeight: 120`. `renderTileContent()` provides compact 2-3-item view. `renderTileContentLarge()` provides 2× scale for the expand right column. `TILE_EMPTY_LABELS` maps action IDs to German placeholder text.

**TileExpandView**: Two-column expand view. Left = `AiResultDetail` (scrollable detail content). Right = `AiResultTileLarge` (200px, same visual style at 2× scale). Header has Run/Update button that directly calls the AI endpoint via `ACTION_ENDPOINTS` map + `useUiStore().ai` config. `onRegister` callback updates `aiResultsRegistry` in `DetailDrawer`.

**AiResultDetail / KununuCardDetail**: `KununuCardDetail` is simplified — no manual editing inputs. Summary text + Kununu link + confidence only. Updates via `TileExpandView`'s "Aktualisieren" button. `GlassdoorCardDetail` keeps only the editable URL field (rating inputs removed).

**SalaryBandChart**: Horizontal band (min→max) with accent Median line and amber Wunschgehalt line. Labels above markers, values below. Shows annotation if desired salary is outside the band.

**AiBtn (StageAiActions)**: Tile-style buttons — `flexDirection: column`, `minHeight: 58px`, icon centered above label. Checkmark badge (top-right, 14px green circle) when `resultTimes[id]` is set. Spinner replaces icon during loading. `resultTimes` initialized from `aiResultsCache._savedAt` timestamps.

**DocumentsTab**: Three sections: Google Drive folder panel (top, only if connected) → Zugewiesen list → library grid (2-column). Library docs show 3 states: not linked / linked-no-Drive / linked-with-Drive-copy. Adding a Google Doc from library auto-copies to Drive folder if one exists.

**Board filters** (`BoardPage`): `visibleStages[]` + `timeFilter` (TimeFilter type) for the main board; `reasonFilter` (ReasonFilter) + `archiveTime` for the archive view. All filtering is client-side after fetch.

**Archive routing**: `showArchived` is derived from `useSearchParams().get("archive") === "true"` in `BoardPage` — NOT a `useState`. Navigating to `/?archive=true` shows the archive view. The Rail has an Archive item that calls `navigate("/?archive=true")` or `navigate("/")` to toggle. After archiving a job, `DetailDrawer.onArchived` callback fires → `BoardPage` calls `navigate("/?archive=true")` to auto-navigate to the archive. Archive button removed from topbar.

**Navigation Rail** (`Rail.tsx`): Order: Board → Calendar → Timeline → **Archive** → Profil → Dokumente → Knowledge → Templates → Settings. Archive is rendered inline (not NavLink) with custom active detection via `useLocation`. Board item active state is overridden to `isActive && !isArchive` so it's inactive when on `/?archive=true`.

**Logo avatar**: `LogoAvatar` in `DetailDrawer` and `Avatar` in `Card.tsx` try `logoUrl` via `<img>` with `onError` fallback to colored initials.

### Calendar Page (`frontend/src/pages/CalendarPage.tsx`)

Month/week toggle. Events from three sources merged and deduplicated by ID:
1. **App events**: `applicationsToCalendarEvents(apps)` — interview dates (parsed from `interview1/2Details` JSON), deadlines (`nextDeadline`), stage-change timeline entries
2. **Activities**: `activityRowsToCalendarEvents(rows)` — from `GET /api/calendar/events?from=&to=`
3. **Google Calendar**: `googleCalendarEventsToCalendarEvents(items)` — from `GET /api/google/calendar/events`

Event pills use **tinted background + left border** (never solid) for WCAG compliance: `background: ${color}1e` (12% opacity), always dark text `var(--fg-1)`. Month view: max 3 pills + "+N mehr". Week view: up to 4 content lines per pill (`.cal-event-pill-week`).

**Popup**: `FloatingPopup` renders via `createPortal(…, document.body)` — escapes all `overflow:hidden` parents. Positioned using click coordinates with viewport clamping. Closes on outside click via `mousedown` listener.

**Filters**: `useCalendarFilters()` hook reads/writes `?view=`, `?types=`, `?phases=`, `?gcal=` URL params. `filterEvents()` applies active filters.

**Mapping files**: `frontend/src/lib/calendarMapping.ts` (event builders), `frontend/src/types/calendar.ts` (CalendarEvent, EVENT_COLORS), `frontend/src/hooks/useCalendarFilters.ts`.

### Multi-User Architecture

**Isolation**: Every protected route calls `getUserId(c)` and filters all queries by `userId`. Tables with `user_id` FK: `applications`, `user_profile`, `user_documents`, `application_tasks`. Child tables (`application_documents`, `application_activities`, `application_contacts`) are isolated transitively via the `application_id` FK.

**Registration flow**: First user registers freely at `/api/auth/setup`. All subsequent users need an invite token (`inviteToken` field in POST body, or `?invite=TOKEN` URL param on the SetupPage). Invite tokens are created via `POST /api/invites` by any logged-in user. Tokens support expiry + email restriction.

**Google OAuth shared/per-user**: `getDriveAccessToken(userId?)` checks user-specific token first, then falls back to shared token (`user_id IS NULL`). This supports a "family instance" where one admin connects Google Drive and all users benefit, while still allowing individual users to connect their own Google account.

**Auto-profile creation**: `/api/auth/setup` inserts a blank `user_profile` row for every new user immediately after account creation.

### Authentication

Multi-user. JWT in httpOnly cookies (no localStorage). `GET /api/auth/status` returns `{ setup: bool }` — if `false`, SetupPage is shown (first-run). If `true`, SetupPage shows login tab by default, or register tab if `?invite=TOKEN` is in the URL. Google Sign-In doubles as Drive + Calendar authorization (one OAuth consent). WebAuthn passkeys supported via `@simplewebauthn/server` with `requireUserVerification: false` for broad authenticator compatibility.

**Session timeout** is configurable per user (Settings → Sicherheit): 15m / 1h / 6h / 24h / 7d / 30d. Stored in `user_profile.session_timeout`. All auth routes call `getSessionTimeout()` before `issueTokens()`. Access token `maxAge` is set accordingly. **Remember-me** checkbox on login: unchecked = session refresh cookie (no `maxAge`), checked = 90-day persistent refresh cookie.

### Google OAuth

Scope required: `https://www.googleapis.com/auth/drive` (NOT `drive.file`) + `documents` + `openid email profile`. The broader `drive` scope is needed to copy user-owned template files. Re-authentication is required when upgrading from older `drive.file` scope. Flow: Settings → `/api/google/auth-url` → consent → `/api/google/callback` → DB + auto-login.

### Design System

Fonts loaded from Google Fonts in `frontend/index.html`:
- **Fira Sans** (400/500/600/700 + italic) — all UI text (`--font-sans`)
- **Fira Sans Condensed** (400/500/600/700) — eyebrow labels (`.eyebrow`)
- **Libre Caslon Text** (400/700 + italic) — display/serif moments (`--font-serif`)
- **Fira Mono** (400/500/700) — numbers + tabular-nums (`--font-mono`)

Shadow system (white halo on dark surfaces):
- `--shadow-card: 0 4px 24px rgba(255,255,255,0.18)` — card glow
- `--shadow-modal: 0 32px 80px rgba(255,255,255,0.30)` — modal glow

Icons: **Iconoir** v7.11.0 (`iconoir-react` package). `width`/`height` props, no `size` prop. All icons are monochrome (`currentColor` stroke). Do not mix with other icon libraries.

Additional design tokens available: `--bg-elevated`, `--border-bp`, `--border-bp-subtle`, `--border-bp-strong`, `--accent-20`, `--accent-30`, `--green-10`, `--red-10`, `--yellow-10`.

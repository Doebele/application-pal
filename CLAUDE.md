# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Type-check (run from project root)
npm run typecheck --workspace frontend
npm run typecheck --workspace backend

# After any schema change: rebuild shared FIRST
npm run build --workspace shared && npm run typecheck --workspace frontend

# Rebuild and restart Docker (always from project root)
cd /Users/clausmedvesek/Developer/projects/application-pal
docker compose build backend frontend && docker compose up -d backend frontend

# Fresh DB setup (new volume / first run) — push full schema
DATABASE_URL="postgresql://postgres:postgres@localhost:15436/application_pal" \
  npx drizzle-kit push --config backend/drizzle.config.ts

# Apply a migration to the running container
docker exec application-pal-db psql -U postgres -d application_pal -c "ALTER TABLE ..."

# Verify new code is in the frontend bundle
docker exec application-pal-frontend grep -r "SomeNewString" /usr/share/nginx/html/assets/
```

## Critical Pitfalls

**Docker working directory**: Always `cd /Users/clausmedvesek/Developer/projects/application-pal` before any Docker command. The CWD persists between Bash calls and may drift to a worktree. Building from a worktree compiles the wrong source with no error.

**Schema changes**: Edit `shared/src/schema.ts` → `npm run build --workspace shared` → then typecheck passes. DB migrations must be applied manually (no auto-migration on container start).

**TypeScript errors block Docker**: `tsc -b` runs inside the Dockerfile. Always run `npm run typecheck` before rebuilding.

**Stale JS artifacts**: If `frontend/src/` contains `.js` files (e.g. `App.js`), Vite resolves them before `.tsx`. Delete immediately.

**`PATCH /api/profile` vs `PUT /api/profile`**: `PUT` requires full schema validation and is used by the Profile page full-save. `PATCH` accepts any subset of fields (no validation) and is used by Settings dropdowns (session timeout, calendar ID, Drive folder). Both exist — use `PATCH` for partial updates from Settings.

**Global 401 interceptor** (`frontend/src/lib/api.ts`): any API response with HTTP 401 immediately redirects to `/setup`. Do NOT call endpoints that might legitimately 401 without a valid session — it will log the user out.

**`/api/auth/me` does silent refresh**: Unlike other auth routes, `/api/auth/me` attempts refresh_token if access_token is expired. `rememberMe` is encoded in the refresh token JWT payload (`{ userId, rememberMe }`) so it survives rotation.

**Clipboard in overlays**: Use `copyText()` helper (defined in `DetailDrawer.tsx`) instead of `navigator.clipboard.writeText()`. Drawer/overlay UIs lose focus, causing `writeText()` to silently fail.

**LM Studio in Docker**: `resolveHostUrl()` rewrites `localhost` → `host.docker.internal`. Never hardcode `localhost` for LM Studio URLs.

**Qwen3 max_tokens**: Always set `max_tokens: 32768`. Qwen3 emits a long `<think>…</think>` block first. `extractJson()` strips it before parsing.

**nginx proxy timeout**: `frontend/nginx.conf` sets `proxy_read_timeout 600s`. AI endpoints can take up to 240s. Never reduce.

**Dropdown fields in OverviewTab**: All three select fields (Pensum, Arbeitsmodell, Vertrag) in `OverviewTab` MUST have local `useState` — do NOT read `value` directly from `app` prop. The mutation is async; without local state the dropdown reverts on every render before React Query refetches.

**Table sticky columns**: The table in `TablePage.tsx` uses a single `<table>` with `border-collapse: separate; border-spacing: 0`. The `<thead>` has `position: sticky; top: 0` for vertical sticking; individual `<th>`/`<td>` have `position: sticky; left/right` for horizontal pinning. Do NOT put `top: 0` on `<th>` — two-axis sticky on the same element fails in browsers. Do NOT use `@hello-pangea/dnd` in `<thead>` — it conflicts with sticky. Column reordering uses native HTML5 drag (`draggable` on handle span only).

**OverviewTab local state pattern**: `company`, `role`, `location`, `salary`, `jobType`, `workModel`, `contractType` all use `useState(app.fieldName)`. Changes call `save(patch)` immediately (no `onBlur` for selects) and update local state simultaneously.

## Architecture

npm workspaces monorepo: `shared`, `backend`, `frontend`.

```
shared/src/schema.ts   ← single source of truth: Drizzle tables + Zod schemas + TS types
backend/src/index.ts   ← entire Hono API (~4000 lines, all routes in one file, no sub-routers)
frontend/src/          ← React 19 + Vite SPA
```

`shared` compiles first. Both `backend` and `frontend` import from `@application-pal/shared`.

### Backend (`backend/src/index.ts`)

Single Hono app. All routes in one file. Uses `drizzle-orm/node-postgres`. No auto-migrations.

**Key helpers** (defined before routes):

| Helper | Purpose |
|---|---|
| `getUserId(c)` | Extracts `userId` from Hono context — use in every protected route |
| `issueTokens(c, userId, rememberMe, accessTimeout)` | Sets `access_token` + `refresh_token` as httpOnly cookies; encodes `rememberMe` in refresh JWT |
| `getSessionTimeout(userId?)` | Reads `user_profile.session_timeout`; call before `issueTokens()` |
| `getDriveAccessToken(userId?)` | User-specific token first, falls back to shared token (`user_id IS NULL`) |
| `callAi(system, user, ai)` | Generic AI caller (LM Studio or Anthropic) |
| `extractJson(raw)` | Strips `<think>` blocks + markdown fences, returns parsed JSON |
| `resolveHostUrl(url)` | Rewrites `localhost` → `host.docker.internal` for Docker networking |
| `persistAiResult(appId, key, data)` | Upserts into `applications.aiResultsCache` JSON with `_savedAt` timestamp |
| `buildExportPayload(userId)` | Assembles all user-data tables for a specific user |
| `applyNameRule(rule, vars)` | Replaces `{firma}`, `{rolle}`, `{datum}` etc. in Drive naming rules |
| `initTasksForStage(appId, stage)` | Inserts `STAGE_TASK_TEMPLATES` entries idempotently |
| `detectJobType(text)` | Regex: extracts pensum % (`"80–100%"`, `"100%"`, etc.) from job text |
| `detectWorkModel(text)` | Regex: extracts `"onsite"` / `"hybrid"` / `"remote"` from job text |
| `detectContractType(text)` | Regex: extracts `"Unbefristet"`, `"9 Monate"`, etc. from job text |
| `normalisePensum(raw)` | Normalises raw % string to nearest standard option (en-dash format) |

**Auth middleware** (`/api/*` except `/api/auth/*`, `/api/google/callback`, `/health`): verifies `access_token` cookie; silently refreshes via `refresh_token` if expired; sets `userId` in context.

**Stage-change hook**: `PATCH /api/applications/:id` detects stage changes → calls `initTasksForStage()` and logs a `stage_change` activity automatically.

**Import extraction** (`POST /api/applications/import`): calls LLM via `extractWithAi()` for structured fields. LLM returns `jobType` (pensum %), `workModel`, `contractType` alongside standard fields. If LLM fails or omits a field, regex detectors (`detectJobType`, `detectWorkModel`, `detectContractType`) provide fallback values. `normalisePensum()` standardises all percentage strings to the en-dash format matching the UI dropdown.

**Validation**: `zValidator("json", schema)` from `@hono/zod-validator`; schemas from `@application-pal/shared` only.

### Frontend (`frontend/src/`)

- **State**: Zustand `useUiStore` (persisted localStorage, key `app-pal-ui-v2`) — theme, accent, density, cardVariant, AI config, Drive naming rules (`driveNameFolder`, `driveNameDoc`), table column config (`tableColumnOrder`, `tableColumnVisibility`, `tableColumnPinning`, `tableColumnSizing`). `driveApplicationsFolderId` is per-user in `user_profile.drive_applications_folder_id` — load via `GET /api/profile`, NOT from Zustand.
- **Auth**: `AuthProvider` + `useAuth()` in `lib/auth.tsx`. Calls `GET /api/auth/me` on mount (with silent refresh). All routes wrapped in `ProtectedRoute` in `App.tsx`.
- **API**: `api` from `lib/api.ts` — Axios, `withCredentials: true`, empty `baseURL`, global 401 interceptor → redirects to `/setup`.
- **Styling**: single `index.css`, CSS custom properties. No Tailwind. `.input-line` = underline input. `.field` = labelled form field. `.md-body` = rendered Markdown.
- **Expand-Logik**: expandable overlays use `position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 10` within `.drawer-body { position: relative }`. Never use `top: 57`.

### Ports & Containers

| Service | Docker port | Container name |
|---|---|---|
| Frontend (nginx) | 8070 | `application-pal-frontend` |
| Backend (Hono) | 8071 | `application-pal-backend` |
| Postgres | 15436 | `application-pal-db` |

### DB Tables

| Table | Purpose | User-isolated | Exported |
|---|---|---|---|
| `applications` | Jobs: stage, tags, salary, archived, archiveReason, matchScore, interview1/2Details, interview1/2Prep, glassdoorData, kununuData, linkedinData, aiResultsCache, googleFolderId, **jobType** (pensum %), **workModel**, **contractType** | ✅ `user_id` FK | ✅ |
| `user_profile` | Per-user profile: masterCv, linkedinBio, headline, personalNotes, googleCalendarId, driveApplicationsFolderId, sessionTimeout, desiredSalary | ✅ `user_id` FK | ✅ |
| `user_documents` | Document library (CV, Zeugnisse, Figma, etc.) | ✅ `user_id` FK | ✅ |
| `application_documents` | Per-job docs; `googleDocId`/`googleDocUrl` for Drive | via `application_id` | ✅ |
| `application_activities` | Timeline events per job | via `application_id` | ✅ |
| `application_contacts` | Contacts per job | via `application_id` | ✅ |
| `application_tasks` | Stage checklists; `isDefault` = auto-created | ✅ `user_id` FK | ✅ |
| `users` | Accounts (email + bcrypt hash) | — | ❌ auth |
| `invites` | Invite tokens; `created_by`, `used`, optional `email` + `expires_at` | — | ❌ auth |
| `webauthn_credentials` | Passkey credentials | `user_id` FK | ❌ auth |
| `google_oauth_tokens` | OAuth token; `user_id` NULL = shared admin token | nullable `user_id` | ❌ credentials |
| `kb_*` | Knowledge-base cache (shared across users) | ❌ shared | ❌ auto-generated |

**Archive pattern**: `applications.archived = "true"` — default filter is `archived != "true"`. `archiveReason`: `unavailable | irrelevant | taken | other` or free text.

**New application fields** (added via `ALTER TABLE`):
- `job_type` — work pensum as percentage string: `"100%"`, `"80–100%"`, `"80%"`, `"60–80%"`, `"60%"`, `"50%"`, `"40%"`, or custom. Auto-detected on import.
- `work_model` — `"onsite"` | `"hybrid"` | `"remote"`. Auto-detected on import.
- `contract_type` — `"Unbefristet"` | `"6 Monate"` | `"9 Monate"` | `"12 Monate"` | custom string. Auto-detected on import.

### Export/Import

`buildExportPayload(userId)` uses `db.select().from(table)` — new columns auto-included. When adding a new user-data table, add to both `buildExportPayload()` and `/api/import`. Never export auth or credential tables.

### Application API

| Endpoint | Notes |
|---|---|
| `GET /api/applications` | List (filtered by userId + archived status) |
| `GET /api/applications/:id` | Single app — used by `DetailDrawer` for fresh AI data on mount |
| `POST /api/applications` | Create |
| `PATCH /api/applications/:id` | Partial update; triggers stage-change hook |
| `DELETE /api/applications/:id` | Delete |

### AI Endpoints (all require `{ ai: AiConfig }` body)

All use `callAi()` + `extractJson()` + `resolveHostUrl()` + `max_tokens: 32768`.

| Endpoint | Returns |
|---|---|
| `POST /api/applications/:id/match-score` | `{ score, breakdown, staerken, luecken, reasoning }` |
| `POST /api/applications/:id/ai/cv-highlights` | `{ highlights, keywords, gaps }` — persisted to `aiResultsCache` |
| `POST /api/applications/:id/ai/cv-doc` | Creates Google Doc from Master-CV; returns `{ docUrl }` |
| `POST /api/applications/:id/ai/cover-letter` | `{ subject, body, docUrl? }` — `createDoc: true` also creates Google Doc |
| `POST /api/applications/:id/ai/email-draft` | `{ subject, body }` — body: `{ type: "application"|"followup"|"decline"|"feedback"|"linkedin" }` |
| `POST /api/applications/:id/ai/interview-prep` | `{ rollenFragen, starBeispiele, vossFragenWhatHow, rueckfragen }` — persisted to `interview1/2Prep` |
| `POST /api/applications/:id/ai/salary-tips` | `{ markteinschätzung, taktiken, formulierungen, vossAnker }` — persisted to `aiResultsCache` |
| `POST /api/applications/:id/ai/salary-check` | `{ lohnband: {min,max,median}, waehrung, basis, begruendung }` — persisted to `aiResultsCache` |
| `POST /api/applications/:id/ai/ats-keywords` | `{ mustHave, niceToHave, softSkills, tools }` — persisted to `aiResultsCache` |
| `POST /api/applications/:id/ai/company-research` | `{ unternehmensueberblick, … }` — persisted to `aiResultsCache` |
| `POST /api/applications/:id/ai/ackermann-script` | `{ zielgehalt, ankergebot, schritte[], … }` — persisted to `aiResultsCache` |
| `POST /api/applications/:id/ai/letter-review` | `{ gesamteindruck, staerken, … }` — persisted to `aiResultsCache` |
| `POST /api/applications/:id/ai/opening-sentences` | `{ saetze: [{satz, ansatz, erklaerung}] }` — persisted to `aiResultsCache` |
| `POST /api/applications/:id/ai/onboarding` | `{ erste30Tage, erste60Tage, erste90Tage, allgemein }` — persisted to `aiResultsCache` |
| `POST /api/applications/:id/ai/glassdoor-check` | `{ rating, reviewCount, ceoApproval, … }` — persisted to `glassdoor_data` |
| `POST /api/applications/:id/ai/kununu-check` | `{ rating, reviewCount, confidence, … }` — persisted to `kununu_data` |
| `POST /api/applications/:id/ai/linkedin-profile` | `{ url, employeeCount, description, … }` — persisted to `linkedin_data` |

**AI Result Cache**: `persistAiResult(appId, key, data)` → stored in `applications.aiResultsCache` as `{ [actionId]: { ...data, _savedAt: ISO } }`. On drawer open, `aiResultsRegistry` is initialized from `app.aiResultsCache` AND a live `useQuery(["application", app.id])` syncs fresh DB data (so results generated in background are loaded). After every AI call, both `["applications"]` and `["application", appId]` queries are invalidated.

### Google Drive Endpoints

Require `drive` scope (NOT `drive.file`).

| Endpoint | Function |
|---|---|
| `POST /api/applications/:id/drive/init-folder` | Creates Drive folder; body `{ folderRule?, parentFolderId? }` |
| `GET /api/drive/templates` | Lists files from `GOOGLE_MASTER_FOLDER_ID` |
| `POST /api/applications/:id/drive/copy-template` | Copies master-folder file to app folder |
| `POST /api/applications/:id/drive/copy-doc` | Copies a user-library Google Doc to app folder |
| `GET /api/drive/folder-info?folderId=` | Validates folder ID and returns name |
| `GET /api/applications/:id/drive/files` | Lists live Drive folder contents |
| `DELETE /api/applications/:id/drive/files/:fileId` | Deletes from Drive + `applicationDocuments` |
| `POST /api/export/drive` | Saves JSON backup to Drive root |

**Drive naming rules**: `applyNameRule(rule, vars)` — placeholders `{firma}`, `{rolle}`, `{name}`, `{datum}` (YYMMDD), `{jahr}`, `{monat}`, `{doc}`. Stored in `useUiStore` (`driveNameFolder`, `driveNameDoc`). Parent folder is per-user in `user_profile.drive_applications_folder_id`.

### Google Calendar Endpoints

Require `calendar.readonly` scope (in `GOOGLE_SCOPES`). Users must re-connect Google to grant this scope.

| Endpoint | Function |
|---|---|
| `GET /api/google/calendar/status` | `{ connected, hasCalendarScope }` |
| `GET /api/google/calendar/list` | Lists all user calendars |
| `GET /api/google/calendar/events?calendarId=&from=&to=` | Fetches events for a date range |
| `GET /api/calendar/events?from=&to=` | Aggregated app activities JOIN applications, filtered by `userId` |

### Key Frontend Patterns

**DetailDrawer**: Main job detail view. `stage` and `url` are lifted to component state for immediate header updates. Tab type: `"process" | "details" | "documents" | "ki" | "contacts" | "notes"`. Default tab: `"process"`. Uses `useQuery(["application", app.id], { staleTime: 0, refetchOnMount: true })` to always load fresh AI data from DB on open.

**ProcessTab** (top → bottom): `InterviewDetailsPanel` (interview stages only) → `TaskChecklist` → `StageAiActions` → `GlassdoorPanel` (inbox only) → AI content blocks → activity timeline. `onSave` passed to both `InterviewDetailsPanel` and `StageAiActions`.

**DetailsTab**: `OverviewTab` (all editable fields incl. Pensum/Arbeitsmodell/Vertrag) + `react-markdown`/`remark-gfm` Stellenbeschreibung with Vorschau/Bearbeiten toggle (`descMode` state). Autosave on `onBlur`. Styled via `.md-body`.

**KI-Erkenntnisse (DetailsTab)**: `STAGE_TILES` mapping determines which tile IDs show per stage. Click → `TileExpandView` (two-column overlay). After AI generation, invalidates `["applications"]` + `["application", appId]` queries.

**AI Tiles — direct generation**: `AiResultTile` with `onRun` prop. Empty tile click = triggers generation immediately (no expand). Filled tile click = opens `TileExpandView`. `buildTileRunner(id, appId, ai, queryClient, onRegister)` factory creates the async run callback used by both `ProcessTab` and `KiInhalteTab`. During generation: button shows spinner + "Wird generiert…", is disabled to prevent double-trigger. In-tile toast shows status.

**TileExpandView**: Overlay for a single AI result. Header actions: „Kopieren" (`copyText()`) and „Als Google Doc" (via `EXPORT_DOC_ENDPOINTS` map). Local toast for copy/export feedback. `onRegister` callback updates parent `aiResultsRegistry` after in-place regeneration.

**StageAiActions**: `resultTimes` from `aiResultsCache._savedAt`. After generation, invalidates both queries. Uses `queryClient` via `useQueryClient()`.

**ProfilePage**: Master-CV and Persönliche Stichpunkte fields have Vorschau/Bearbeiten toggle (same pattern as Stellenbeschreibung). Preview is a scrollable `.md-body` box (`maxHeight: 480px`). Edit uses `AutoResizeTextarea` (normal) or full `<textarea>` (expanded mode).

**Calendar Page** (`CalendarPage.tsx`): Events merged from 3 sources (deduplicated by ID): `applicationsToCalendarEvents()`, `activityRowsToCalendarEvents()` (DB), `googleCalendarEventsToCalendarEvents()` (GCal). Event pills: tinted bg (`${color}1e`) + left border for WCAG. `FloatingPopup` via `createPortal(…, document.body)` escapes `overflow:hidden`. Match score badge on pills (colored text, no bg/border). Month view: 6 pills max, `minmax(0,1fr)` columns for equal width.

**Table Page** (`/table`, `TablePage.tsx`): TanStack Table v8 with column pinning (left only — right pinning disabled), resizing, ordering (native HTML5 drag on handle span), sorting, visibility. Column config persisted in Zustand (`tableColumnOrder`, `tableColumnVisibility`, `tableColumnPinning`, `tableColumnSizing`). Default sort: `createdAt` descending. `RunAiButton` component triggers AI endpoints per-row. Sticky layout: `thead { position: sticky; top: 0 }` + pinned `th`/`td` horizontal-only sticky. No shadow on pinned `th`, shadow preserved on `td`.

**Shared field components** (exported from `ImportDrawer.tsx`):
- `PensumField` — dropdown (100%, 80–100%, 80%, 60–80%, 60%, 50%, 40%, Auf Anfrage) + "Individuell…" with free-text input. Used in ImportDrawer review and OverviewTab.
- `ContractField` — dropdown (Unbefristet, 6/9/12 Monate) + "Individuell…" with free-text input. Used in ImportDrawer review and OverviewTab.

**Navigation Rail** (`Rail.tsx`): Board → Liste → Kalender → Timeline → Archiv → Profil → Dokumente → Knowledge → Templates → Einstellungen. User section at bottom is clickable → opens `UserModal` (portal, anchored above trigger). Modal has: email + app count, „Nutzer wechseln" → `/setup`, „Abmelden" with two-step confirmation.

**Board Card** (`Card.tsx` `CardRich`): Stage badge removed — cards are already in their stage column. Match score badge only (top-right). Colors use CSS vars `--score-high/mid/low` (WCAG AA compliant in both themes).

**Archive routing**: `showArchived = useSearchParams().get("archive") === "true"` in `BoardPage` (not `useState`). After archiving, `DetailDrawer.onArchived` fires → `navigate("/?archive=true")`.

**Board Topbar**: Card-style selector (`<select>` for Rich/Compact/Minimal/Editorial) placed left of Filter button. Only shown on main board, hidden in archive view.

**Topbar component** (`Topbar.tsx`): Accepts `searchValue` + `onSearchChange` for controlled search. `actions` slot for right-side buttons. Used by both Board and Table pages.

### Multi-User Architecture

**Isolation**: `getUserId(c)` in every protected route; all queries filtered by `userId`. Direct `user_id` FK: `applications`, `user_profile`, `user_documents`, `application_tasks`. Child tables isolated transitively via `application_id`.

**Registration**: First user registers freely. Subsequent users need an invite token (`inviteToken` in POST body, or `?invite=TOKEN` URL param). SetupPage always shows Anmelden/Registrieren tabs. Any logged-in user creates invites via `POST /api/invites`; Settings → "Nutzer einladen" manages them.

**Google OAuth**: `getDriveAccessToken(userId?)` checks user-specific token first, falls back to `user_id IS NULL` (shared admin token). Per-user Drive folder and Google Calendar configured independently.

**Auto-profile**: `POST /api/auth/setup` inserts a blank `user_profile` row for every new user.

### Authentication

JWT in httpOnly cookies. `GET /api/auth/status` returns `{ setup: bool }`. `GET /api/auth/me` does silent refresh (tries refresh_token if access_token expired). Google Sign-In covers Drive + Calendar in one consent. WebAuthn passkeys via `@simplewebauthn/server` (`requireUserVerification: false`).

**Session timeout**: configurable per user in `user_profile.session_timeout` (15m/1h/6h/24h/7d/30d). All auth routes call `getSessionTimeout(userId)` before `issueTokens()`. **Remember-me**: unchecked = session cookie + 1-day JWT; checked = 90-day persistent cookie; `rememberMe` encoded in refresh token payload and preserved through rotation.

### Google OAuth Scopes

`openid email profile https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/calendar.readonly`

`drive` scope (not `drive.file`) is required to copy user-owned template files.

### Design System

Fonts (loaded in `frontend/index.html` from Google Fonts): **Fira Sans** (`--font-sans`), **Fira Sans Condensed** (`.eyebrow`), **Libre Caslon Text** (`--font-serif`), **Fira Mono** (`--font-mono`)

Shadows (white halo on dark surfaces): `--shadow-card: 0 4px 24px rgba(255,255,255,0.18)` · `--shadow-modal: 0 32px 80px rgba(255,255,255,0.30)`

Icons: **Iconoir** v7.11.0 (`iconoir-react`). Use `width`/`height` props (no `size`). Do not mix with other icon libraries.

**Stage colors**: CSS variables `--stage-color-{stage}` defined in `:root` (dark) and `[data-theme="light"]` (WCAG AA overrides). Use `var(--stage-color-import_validating)` etc. — never hardcode hex stage colors in components.

**Score badge colors**: CSS variables `--score-high/mid/low` with matching `-bg` and `-border` variants. Dark mode: bright greens/yellows/reds. Light mode: WCAG AA compliant darker shades (verified ≥4.5:1 contrast on white). Use these variables everywhere match score is displayed.

**Accessibility**: All badge colors (stage + score) verified WCAG AA (≥4.5:1 contrast ratio) in both light and dark mode. Light mode overrides live in `[data-theme="light"]` block of `index.css`.

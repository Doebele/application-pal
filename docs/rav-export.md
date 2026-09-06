# RAV / ORP Proof-of-Job-Search Export

Swiss unemployment offices (RAV in German-speaking cantons, ORP in French-speaking ones)
require a **monthly proof of job-search efforts** — a table listing every application with
date, employer, role, how it was submitted and what came back. Application-Pal already
tracks all of that, so this feature writes the table instead of the user retyping it.

The implementation is modelled on a real ORP tracker from the Geneva/Vaud region: 12
columns, four dropdown lists enforced by Google Sheets data validation, and a running
number that restarts in every calendar month.

---

## The sheet

| # | Column (FR) | Type | Source in Application-Pal |
|---|---|---|---|
| A | `Num.` | counter | running, **restarts each calendar month** |
| B | `Date de la postulation` | `dd.MM.yyyy` | `applications.appliedAt ?? createdAt` |
| C | `Entreprise / Employeur` | text | `company` |
| D | `Poste / Fonction` | text | `role` |
| E | `Lieu` | text | `location` |
| F | `Type de candidature` | **dropdown** | `ravApplicationType`, else derived |
| G | `Personne de contact` | text | `contactPerson` → first `application_contacts` row → `N/A` |
| H | `Coordonnées` | **dropdown** | derived (see below) |
| I | `Source de l'offre` | **dropdown** | `source`, via regex |
| J | `Résultat / Statut` | **dropdown** | `stage` |
| K | `Relance / Suivi` | **dropdown** (same list as J) | `stage`, follow-up |
| L | `Justificatif / Preuve` | **dropdown** | `ravProof`, else `email` |

Column widths are taken from the original template. Newly created sheets reproduce them,
along with a bold frozen header row.

### Languages

Values are stored as **canonical keys** (`sent`, `online`, `linkedin`, …) and rendered per
language, so the same application exports to a German, French or English sheet. The full
translation table lives in `backend/src/rav.ts` (`RAV_SHEET`).

The French strings must stay **character-exact**, including the typographic apostrophes
(U+2019) in `Source de l'offre`, `En phase d'entretien` and `Offre d'emploi`. They are
compared against the data validation lists of sheets that already exist in users' Drive;
a plain ASCII apostrophe silently breaks the match.

---

## Two semantics taken from the real sheet

These look like bugs and are not. Both were found by the self-check before anything was
written to a live sheet.

### Column J holds the effort, not the outcome

In the original tracker every sent application keeps `Candidature envoyée` in column J,
even after a rejection; the result lives in column K. That is what the office counts — an
outcome must not erase the proof that the effort was made.

`ravStatus()` therefore maps every stage from `application_sent` onward to `sent`, and
`ravFollowUp()` carries `no_response` / `interviewing` / `rejected` / `offer` in column K.

### Column H is not the job source

`Coordonnées` (H) describes **who the application went through**; `Source de l'offre` (I)
describes **where the posting was found**. A job spotted on LinkedIn but submitted through
the employer's own portal is `Entreprise` in H and `LinkedIn` in I — exactly what the real
sheet shows. Only a recruiter contact changes H.

---

## Derivation

Applied whenever the per-application override is `NULL`:

```
stage → J (status)
  import_validating               → not_applied
  preparing_cv | preparing_letter → preparing_cv
  everything from application_sent on → sent

stage → K (follow-up), empty while nothing has come back
  application_sent | pending → no_response
  interview_1 | interview_2  → interviewing
  rejected → rejected · accepted → offer

source (lowercased) → I (job source)
  /linkedin/ → linkedin · /job-?room|arbeit\.swiss/ → jobroom
  /recruit|headhunt|personalberat/ → recruiter
  /empfehl|referral|recommand/ → referral
  empty or /website|karriere|career|unternehmen|company/ → company
  otherwise → other

H = recruiter contact present ? recruiter : company
F = ravApplicationType ?? (recruiter contact ? recruiter : online)
L = ravProof ?? email
```

Archived applications are included — a rejection is still valid proof of an effort.

Both overrides are editable per application in the drawer's **Übersicht** tab
("Art der Bewerbung", "Nachweis"); the empty option means "derive it".

---

## Sorting, month blocks and idempotency

The reference date is `appliedAt ?? createdAt`. `appliedAt` is set exactly once, when an
application moves to `application_sent`.

- **Sorting**: date ascending, `company` as tiebreaker. With 10–15 applications a month
  several share a day; without a stable tiebreaker the order would change between runs.
- **Month blocks**: rows are grouped by calendar month and `Num.` restarts at 1 in each,
  matching the original sheet.
- **Placeholder rows**: rows whose date/company/role cells are empty or `-` count as free
  slots. A back-filled application claims a free slot **inside its own month block** before
  falling back to trailing space, so blocks stay contiguous.
- **Idempotency**: existing rows are keyed by `datum|firma|rolle` (trimmed, lowercased,
  whitespace-collapsed). A known row is updated **in place and keeps its running number**;
  an unknown one is appended. Running the same month twice is a no-op — this is what makes
  a recurring monthly job safe.
- **Nothing is ever deleted.** A row added by hand, or one whose application was removed
  from Application-Pal, stays in the proof.

`planRavWrite()` in `backend/src/rav.ts` is a pure function and carries all of this.

---

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/rav/sheet-info?spreadsheetId=` | Accepts a URL or a bare ID. Returns `{ id, title, url, lang, entries }`; `lang` is **detected from the header row** |
| `POST /api/rav/create-sheet` | `{ lang, title?, parentFolderId? }` — empty formatted sheet (header, widths, all four validations over rows 2–200), moved to the chosen folder, stored as `ravSheetId` |
| `POST /api/export/rav-sheet` | `{ applicationIds?, month?, from?, to?, includeArchived?, target?, lang?, title?, parentFolderId? }`. `applicationIds` wins over the period. `target: "new"` produces a standalone file and **leaves `ravSheetId` untouched**; the default `"linked"` writes into the configured sheet. Returns `{ added, updated, skipped, target, url }` |
| `POST /api/export/rav-csv` | Same selection plus `lang` — `text/csv` with BOM and CRLF so Excel reads UTF-8 correctly. Needs no Google and no configured sheet; numbering starts fresh, no dedupe |

Two behaviours worth knowing:

- **The language of an existing sheet is not configurable.** For `target: "linked"` the
  language comes from the sheet's header row, never from the UI. Writing German values
  into a French-validated sheet would mark every cell invalid.
- **The grid is grown before writing.** The original template is 25 rows tall; both writing
  and validating past the grid are rejected by the Sheets API, so the export issues an
  `appendDimension` request first. Validation is then re-applied down to `lastRow + 15`,
  which is also how appended rows get working dropdowns.

---

## Using it

### Table view → "RAV-Report"

Opens a dialog operating on the **currently visible rows** — search and stage filters apply.

1. **In hinterlegte Datei synchronisieren** — append/update in the configured sheet.
   When none is configured, the same block offers linking one (URL or ID) or creating one,
   both saved to the profile, so the feature works before anyone opens Settings.
2. **Einmaliger Export** — a standalone Google Sheet or a CSV download, with a language
   picker. Neither touches the configured file.

### Drawer

The **Prozess** tab has "Ins RAV-Blatt eintragen" for a single application — the same
sync path with one id. Available from Board and table alike, since the drawer opens from
both.

### Settings → Google Drive & Docs → RAV-Nachweis

Manages the target file: link an existing one, or "Neu erstellen" with language, title and
target folder. Shows the detected language and the current entry count. Settings → Backup
additionally has the monthly run (`<input type="month">`).

---

## Setup

The migration is not applied automatically:

```bash
docker exec application-pal-db psql -U postgres -d application_pal -f - < backend/drizzle/0011_rav_export.sql
```

Or inline:

```sql
ALTER TABLE applications ADD COLUMN rav_application_type text, ADD COLUMN rav_proof text;
ALTER TABLE user_profile ADD COLUMN rav_sheet_id text;
```

**No re-consent is required.** `https://www.googleapis.com/auth/spreadsheets` was added to
`GOOGLE_SCOPES` for new connections, but the Sheets API also accepts the full `drive` scope
for reading, writing and creating spreadsheets — which every existing token already has.
`GET /api/google/status` returns `hasSheetsScope`, true when **either** scope is present.
Do not narrow that back to a `"spreadsheets"` substring check: it falsely warns on every
token issued before this feature.

---

## Tests

`backend/src/rav.check.ts` is an assert-based self-check using the real tracker as a
fixture — no framework, no runner:

```bash
npx tsx backend/src/rav.check.ts
```

It covers language detection, the exact row mapping, re-export producing no duplicates,
in-place updates keeping their number, a back-fill landing in its own month block, a new
month restarting at 1, sort stability, and the derivations. Run it after touching anything
in `rav.ts`.

---

## Deliberately not built

- **Export buttons on board cards and table rows** — the drawer opens from both views and
  covers the single-application case once.
- **A "already in the sheet" indicator per application** — would need a Sheets read on every
  drawer open. The export response already reports added vs. updated.
- **Deleting or tidying rows** — the export only writes and updates. For an official record
  that is the right direction.
- **A scheduled monthly run** — worth adding once the manual export has run for a few
  months. The idempotency work above is the prerequisite and is already in place.

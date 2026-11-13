# CV-Check `/cv-check`

Scores a CV the way VMock does (the tool career-transition services such as LHH use) and
shows what to change to reach **80+ of 100 points**. Deterministic checks run in code;
only judgements go to the AI. Anything that cannot be verified is shown as
**"nicht prüfbar"** instead of guessed.

---

## Where the CVs come from

No extra setting: the CVs are the entries in **Documents** with category `lebenslauf`
(one per language, detected from the name or tags, e.g. `CV-2026-en`). The app is the
source of truth; Google Docs and PDFs are output.

1. **Import** (tab *Struktur*): the AI structures the CV text into sections, positions
   and bullets, copying the wording verbatim. A verbatim check flags anything that
   differs from the source. Every import or edit is a new version (`cv_versions`,
   append-only); originals are never overwritten.
2. **Check** (tab *Bewertung*): runs as a background job. A local model needs a few
   minutes; you can leave the page.

## Scoring

| Area | Points | What counts |
|---|---|---|
| **Impact** | 40 | Action verbs 15 · Specifics 15 · Language 10 |
| **Presentation** | 20 | Pages 4 · Essential sections 4 · Format 8 (9 checks) · Section details 4 (7 checks) |
| **Competencies** | 40 | Leadership, Initiative, Analytical, Communication, Teamwork — 8 each |
| **Bonus** | +10 | all hygiene checks passed (and verified) |

Area status: **Good Job** ≥ 80 % · **On Track** ≥ 50 % · **Needs Work** below.

Weights, word lists and thresholds live in `backend/src/cv-criteria.ts`
(`version: "vmock-1"`), not in the scoring code.

### Inputs of one check run

| Input | Source | Used for |
|---|---|---|
| Structured CV | latest `cv_versions` row | bullets, sections, dates, contact fields |
| Doc header/footer | Google Docs API | name and contact details that the text export leaves out |
| PDF layout | Drive PDF export → `pdfjs-dist` | pages, margins, page fill, font sizes, bold/italic, colour, images |
| AI judgement | one call per run | verb strength, scope/outcome, 2 rewrites per bullet, spelling, competency evidence, branding headline |

Rules for the AI part:
- **Specifics need a number.** The AI decides scope vs. outcome, but a bullet without any
  number never counts (calibrated against a real VMock result).
- **Rewrites never invent facts.** A missing number appears as a highlighted `[X]`
  placeholder for the user to fill in.
- **Competency evidence is quoted verbatim.** Quotes that don't occur in the CV are dropped.

All inputs are stored on the version (`check_result = { inputs, result }`). Every read
re-scores from them, so the UI language and accepted points apply immediately — no new AI call.

## Accepting points

Some suggestions are deliberate choices (often layout). Any open check — or, per bullet,
the opener or the missing number — can be marked **Akzeptiert**:

- it counts as passed with full points;
- the score shows both values, e.g. **65 · 64 gemessen + 1 akzeptiert**;
- the findings stay visible, and acceptance can be withdrawn at any time;
- stored per user and language in `user_profile.cv_check_waivers`, so it carries over to
  new versions.

## UI

- **Content area:** the CV as PDF in the selected language (live export of the Google Doc), rendered with
  pdf.js. Bullets with open points are highlighted red, accepted ones in the accent colour, language
  findings amber. Clicking a highlight opens that bullet under *Verbesserungen*; clicking a bullet there
  scrolls the PDF to it. Highlights are located by text, so the viewer needs no coordinates from the backend.
- **Sidebar tabs:** *Bewertung* (total, steps to improve with point gains, areas, all checks,
  recommendations) · *Verbesserungen* (open bullets with rewrites, language issues, competency
  evidence) · *Struktur* (import, master language) · *Versionen*.
- Both panels support the **Large** view (Expand icon, Escape closes).
- The building blocks are in `frontend/src/components/check/` (tokens + classes, no inline
  colours) and are meant to be shared with the LinkedIn-Check and mirrored in Figma.

## API

| Endpoint | Function |
|---|---|
| `GET /api/cv/sources` | CVs from Documents, per-language status of the PDF |
| `POST /api/cv/import` · `GET /api/cv/import-jobs` | structured import as background job |
| `GET /api/cv/current` · `GET /api/cv/versions[/:id]` | current version per language, history |
| `GET /api/cv/pdf?documentId=` | CV as PDF for the viewer |
| `POST /api/cv/check` `{ lang, ai, uiLang }` · `GET /api/cv/check-jobs` | check as background job (steps `pdf` → `llm` → `score`) |
| `GET /api/cv/check?lang=&uiLang=` | latest result, re-scored with current waivers; `stale` if a newer version exists |
| `POST /api/cv/check/waivers` `{ lang, key, accepted }` | accept / withdraw one point (`format.colour`, `action:<bulletId>`, `specifics:<bulletId>`) |

Self-check after touching the rules: `npx tsx backend/src/cv-rules.check.ts`.

## Calibration

Reference: an English 4-page CV that VMock scored **57** (Impact 13 · Presentation 5 ·
Competencies 39). Application-Pal currently gives **64** (15 · 8.7 · 40). Presentation is
still too generous.

## Planned

- Optimisation loop like the cover letter: pick suggestions → new version → check again
- Language sync (master + translations), Doc/PDF output into the source folder
- Tailored CV per application

## Neu-Import vor dem Check

`POST /api/cv/check` nimmt `reimport: "auto" | "always" | "never"` (Standard `auto`; mit explizitem `versionId` immer `never`). `auto` importiert den aktuellen CV der Sprache aus Dokumente neu, wenn dessen Drive-`modifiedTime` neuer ist als die neueste App-Version — spätere In-App-Bearbeitungen bleiben so erhalten. `always` = Häkchen „Vorher neu importieren“ im Score-Tab. Der Job zeigt dabei den Schritt `import`, der Import erscheint auch im Struktur-Tab, und `job.reimported` lässt die Seite Quellen, Versionen und PDF neu laden. Bullet-IDs sind pro Import zufällig: akzeptierte Bullet-Ausnahmen (`action:`/`specifics:`) werden auf Bullets mit gleichem Text übertragen (`carryOverBulletWaivers`). Der Layout-Check fällt auf den aktuellen CV der Sprache zurück, wenn die Importquelle nicht lesbar ist (Desktop, `drive.file`).

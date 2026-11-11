# LinkedIn-Check `/linkedin`

Scores your LinkedIn profile out of **100 points** (target **80+**) and helps you get there:
AI-written drafts per language, a checklist of what to change on LinkedIn, and a version
history. Deterministic checks run in code; only judgements and texts go to your configured
local AI. Application Pal **never writes to LinkedIn**: you copy everything yourself.
What a source doesn't deliver is shown as **"nicht bewertet"** instead of guessed.

The Rail entry is shown for the personas *Berufsumsteiger* and *Berufseinsteiger*.

---

## Where the profile comes from

| Source | What it delivers | Gaps |
|---|---|---|
| **API connection** (Profile page, [setup](linkedin-setup.md)) | full read-only copy, auto-synced every 24 h | photo, banner, custom URL, Featured, "Open to" |
| **ZIP export** (LinkedIn → Settings → Data privacy → Get a copy) | the same CSVs as the API, incl. recommendations given/received | same as API |
| **Profile PDF** ("Save to PDF" on your profile) | headline, About, experience, education | only the top 3 skills, so skills are never rated from a PDF |
| **Pasted page text** | whatever sections the AI finds | only those sections are rated |

Every import is a new version (`linkedin_versions`); identical imports are skipped.

**One profile per language.** LinkedIn keeps a separate profile per language, so every
version has a language (DE / EN / FR), detected on import and correctable afterwards. The
language switch at the top shows the score, draft and checklist of one language.

## Scoring

| Area | Points | Groups |
|---|---|---|
| **First impression** | 25 | Photo · Banner · Headline · URL, location, contact |
| **Content** | 35 | About · Experience · Featured · Projects, education, certifications |
| **Evidence** | 20 | Skills · Recommendations · Honors, publications, languages |
| **Activity** | 20 | Posts and articles · Comments and exchange · Network and groups |
| **AI visibility** | 8 | separate, never in the total: how well AI search can read and cite the profile |

Area status: **Good Job** ≥ 80 % · **On Track** ≥ 50 % · **Needs Work** below.

Each checkpoint has a kind:

- **Rule** — checked in code (URL, location, About length, numbers in positions, gaps, …).
- **Self-report** — what no import shows (photo, banner, Featured, "Open to", intro link):
  you rate it yourself using the description next to it.
- **AI judgement** — the local model rates headline, About and posts (hook, proof,
  positioning, niche) and suggests 3 headline variants. Without a judgement run these
  points are "not rated".

Weights, word lists and thresholds live in `backend/src/linkedin-criteria.ts`
(`version: "li-1"`), not in the scoring code.

Rules that keep the score honest:
- A checkpoint without input is **not rated**: it leaves the maximum, and the total is
  scaled to the rated points. Nothing is guessed.
- A section the source delivered but that is empty scores 0. A missing headline or About
  scores 0 on all its checkpoints, including the AI ones.
- Buzzwords in the About cost −0.5 each, never more than the About points already earned.
- Points you keep on purpose can be **accepted** and count as passed, like in the CV-Check.

The score tab lists the **biggest levers** first, each with its point gain and effort
(minutes, hours, weeks).

## AI tools (tab *KI-Werkzeuge*)

1. **Questions:** a few short questions (strengths, audience, outcomes, target role). Your
   strengths are offered as keywords from your CV and Documents.
2. **Positioning:** the AI proposes 3 positioning options; pick one or write your own.
   Generating requires a confirmed positioning.
3. **Generate** the parts you need:
   - *Intro*: headline (aimed at 160–220 characters) with variants, About, Featured
   - *Positions*: descriptions per role
   - *Skills*
   - *Activity*: recommendation requests, content pillars, group criteria, a 4-week plan

   The base depends on what exists in that language: an import in the same language is
   **sharpened**; otherwise the newest import in another language is **translated**;
   otherwise the profile is **built** from your CV, Documents and answers.
4. **Translations:** one click translates the finished draft into the other profile
   languages. Companies, schools, dates and skill names stay as they are.

The result is one **draft** per language, scored like an import (*Bewertung (Entwurf)*), with
copy cards per field showing LinkedIn's length limits.

Rules for the AI part:
- **No invented facts.** Any number that doesn't appear in your sources (profile, CV,
  Documents, answers; not the job ad) becomes a highlighted `[X]` for you to fill in.
  Unknown companies or schools become `[X]` with a warning.
- **Groups** are suggested as criteria and search terms, never as invented group names.
- **Language guard:** every answer is checked against the profile language; text in the
  wrong language gets one translation pass, otherwise a warning is shown.
- A headline that is too long is shortened at a part or word boundary; one that is too short
  gets one extra pass that may only add what your sources contain, never padding.

## Suggestions from your documents

Skills, certificates (issuer, date, credential ID) and languages from your CV-Check versions
(or Master-CV) and your certificate documents in **Documents**, each marked as already in the
profile or in the draft. One click adds them to the draft. No AI involved.

## Checklist

What's left to do on LinkedIn, per language:

- **Transfer:** copy the draft field by field (headline, About, each position, skills, Featured)
- **Basics:** the self-report checkpoints with how-to tips
- **Documents:** certificates and languages to add
- **Network:** recommendation requests
- **Plan:** the 4-week plan

Items tick themselves only when a **re-import proves** the change (same text, certificate
present, …), never from the draft alone. A draft field still containing `[X]` can't be
ticked. Ticking a basics item sets the self-report, so score and checklist stay in sync.

## Career starters

Without any import, the checklist starts with a **set-up guide**: account, visibility,
custom URL, location, education, internships, "Open to", first contacts, companies to follow.

With the persona *Berufseinsteiger*, the questions ask about education and practical
experience, and the generator puts education, internships, projects and volunteering first
without inventing work experience. The headline is the target entry-level role plus degree.

## Versions

Every import and draft is scored, with history and a side-by-side comparison of two
versions. Area deltas are shown only when both versions could rate the same checkpoints;
otherwise only the total is compared. Imports can be deleted; drafts are deleted from the
tools tab.

## UI

- **Tabs:** *Bewertung* · *KI-Werkzeuge* · *Quelle & Ziel* · *Checkliste* · *Versionen*
- A PDF import can be viewed as PDF (pdf.js), like in the CV-Check.
- Draft cards and the panel support the **Large** view (Expand icon, Escape closes).
- Shared building blocks with the CV-Check: `frontend/src/components/check/`.

## API

| Endpoint | Function |
|---|---|
| `GET /api/linkedin/status` · `POST /api/linkedin/sync` | API connection, sync as background job |
| `POST /api/linkedin/import/zip` · `/import/pdf` · `/import/text` | imports (PDF and text via AI as background job) |
| `GET /api/linkedin/jobs` | poll background jobs |
| `GET /api/linkedin/check?lang=&uiLang=` | score, levers, sources, checklist for one language |
| `POST /api/linkedin/check` `{ ai, uiLang }` | AI judgement as background job |
| `POST /api/linkedin/check/waivers` | accept / withdraw a point |
| `GET` · `PATCH /api/linkedin/state` | answers, goal, self-report, positioning, checklist ticks |
| `POST /api/linkedin/positioning` `{ ai, lang }` | 3 positioning options |
| `POST /api/linkedin/generate` `{ ai, lang, parts }` | generate draft parts |
| `PATCH` · `DELETE /api/linkedin/drafts/:id` | edit / delete a draft |
| `POST /api/linkedin/drafts/:id/translate` `{ ai, langs }` | translate a draft into other languages |
| `GET /api/linkedin/versions[/:id]` · `PATCH` · `DELETE` | history, compare, correct language, delete imports |
| `GET /api/linkedin/versions/:id/pdf` | imported PDF for the viewer |

Self-checks after touching the logic:

```bash
npx tsx backend/src/linkedin-rules.check.ts
npx tsx backend/src/linkedin-llm.check.ts
npx tsx backend/src/linkedin-gen.check.ts
npx tsx backend/src/linkedin-sources.check.ts
npx tsx backend/src/linkedin-checklist.check.ts
```

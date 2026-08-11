# Cover Letter Coach

Application Pal turns cover-letter writing into a guided, AI-assisted workflow that stays personal to **you**. Instead of a single "generate" button, it combines:

1. **Reusable personal guidance** you configure once on the **Cover Letter** settings page (`/letter-coach`) — structure, values, strengths, phrasing, style, no-gos, and a reference letter.
2. **A per-job guided draft panel** inside each application (the *Cover Letter* stage) — AI-suggested talking points, opening sentences, draft generation, review, and version history.

Everything is written in the **correspondence language** of the application (German or English), independent of the app's UI language.

> **Requires an AI provider.** Configure one under **Settings → AI Integration** first — see [ai-setup.md](ai-setup.md). Without it, the buttons in this workflow are disabled.

---

## 1. The Cover Letter settings page (`/letter-coach`)

Open it from the left navigation rail (**Cover Letter**, envelope icon). These settings are **persistent and reusable** — they are applied to *every* cover letter, opening sentence, and review the AI generates, for **all** your applications. You fill them in once and refine them over time.

Each field **autosaves** as you type (on blur). Empty fields are simply ignored — nothing is silently defaulted. Where a sensible starting point exists, a **"Use default"** button copies a recommended template into the field so you can edit rather than start from scratch.

> These settings **supplement** your Master CV, Personal Notes, and Documents library (they don't replace them). The CV and documents provide the *facts*; these settings control the *structure, style, and emphasis*.

### The seven fields

| Field | What it controls | Fill it with |
|-------|------------------|--------------|
| **Structure** | Which sections the letter has and in what order | A numbered outline. A recommended default is provided (see below). |
| **My values & way of working** | Values the AI should emphasize and weave in | e.g. user-centricity, pragmatism, sustainability, team leadership |
| **Core strengths (with evidence)** | Recurring strengths you can prove | Strengths **with concrete results or numbers** (e.g. "Scaled a design system across 6 divisions") |
| **Preferred phrasing** | Wording and text snippets you like | Phrases/openers you want reused; tone-setting sentences |
| **Style & tone** | How the letter should *sound* | e.g. direct, short sentences, active voice, formal vs. casual |
| **To avoid** | Clichés, phrases, or topics to exclude | e.g. "Hiermit bewerbe ich mich…", unproven superlatives |
| **Reference letter** | A past letter used only as a **style** reference | Paste an earlier cover letter you liked — it is **not copied**, only used as a style guide |

### Recommended defaults ("Use default")

Two fields ship with a recommended Swiss-market template you can adopt with one click:

**Structure** (max. 350 words):

1. Subject: role + reference number if any
2. Opening (2–3 sentences): an attention-grabbing hook with a concrete company/product reference — **not** "Hiermit bewerbe ich mich…"
3. Why me: 2–3 core strengths with quantified evidence, mirrored against the job's top requirements
4. Why this company: a genuine connection to product / culture / mission
5. Close: a confident call-to-action, optionally availability / start date

**Style & tone:**

> Active voice, short sentences, no clichés or unproven superlatives. Mirror the keywords from the job description. Swiss spelling (ss instead of ß). Evidence instead of adjective lists.

**To avoid:**

> "Hiermit bewerbe ich mich…", generic clichés, unproven superlatives ("highly motivated", "team player").

> The remaining fields (values, strengths, preferred phrasing, reference letter) are intentionally **empty by default** — they are personal to you. The more concrete and evidence-backed you make *Core strengths*, the stronger every generated letter becomes.

### How the guidance reaches the AI

Under the hood, the non-empty fields are compiled into a **"Binding candidate guidance"** block that is appended to the system prompt of three AI actions:

- **Cover letter generation** — respects structure, style, and no-gos; uses your reference letter as a style model.
- **Cover letter review** — additionally checks whether the draft *complies with your guidance* and flags deviations.
- **Opening sentences** — style and values feed into the three suggestions.

### Natural writing style (humanizer)

A toggle at the top of the page (**on by default**) tells the AI to write like a human and avoid the usual "AI tells", using a ruleset tailored to the **correspondence language** (DE / EN / FR). It is applied to every AI-generated piece of prose — the cover letter, opening sentences, building blocks, the AI-generated **CV highlights**, and the **review** (which additionally checks the letter against these rules and flags violations) — but **never** to your own Master CV text, and it never invents facts.

Each language has its own rules, because AI tells differ by language:

- **DE** — no inflated marketing phrasing or unproven superlatives ("hochmotiviert", "leidenschaftlich"), no mechanical connectors in every paragraph ("darüber hinaus", "zudem"), no vague citations ("Studien zeigen"), no forced rule-of-three, varied sentence length. Correct grammar and formal *Sie* are **not** treated as AI tells.
- **EN** — no filler buzzwords ("delve", "leverage", "tapestry"), no "It's not just X, it's Y", no em-dash overuse, no vague attributions.
- **FR** — French professional writing is formal by default: connectors like « néanmoins » and « toutefois » are legitimate and are **not** over-corrected; it targets repeated "En effet"/"Il convient de noter" openings, forced triads, and empty superlatives.

The rulesets are condensed, original guidance informed by the open-source humanizer skills [blader/humanizer](https://github.com/blader/humanizer) (EN, Wikipedia "Signs of AI writing"), [samber/cc-skills · humaniseur-fr](https://github.com/samber/cc-skills) (FR), and [LOGIN-TB/claude-skills · vermenschlichen](https://github.com/LOGIN-TB/claude-skills) (DE, MIT). Turn the toggle off if you prefer the model's default voice.

**On-demand "Humanize" button.** Separately from the always-on inline guidance, the result tab has a **Vermenschlichen / Humanize** button that runs a dedicated second pass over the *current* letter: it rewrites only the wording to sound more human (applying the language ruleset), keeps all facts, structure, and length, and saves the result as a **new version** so you can compare or restore. This works regardless of the toggle — the button is itself the opt-in — and mirrors how the source skills natively operate (editing existing text).

---

## 2. The guided draft panel (Cover Letter stage)

Move an application into the **Cover Letter** stage and open it. The *Actions* tab shows a single guided workspace split into **three sub-tabs** (a green checkmark appears on a tab once it has content):

### Tab 1 — Prepare

- **Job-specific notes** — free text for anything unique to *this* application (a personal contact, a referral, a special occasion). This also informs the opening sentence.
- **Choose building blocks** — click **Suggest building blocks**. The AI proposes, based on your CV + documents + guidance + the job description, three groups:
  - **Touchpoints** — concrete connections between you and the company/role (basis for the opening)
  - **Values match** — which of your values fit this company, and why
  - **Benefit to the company** — what you concretely bring, each with evidence from your CV

  Tick the ones you want; each selected item becomes an **editable** text field. Your selection is saved automatically and survives tab switches and reloads.

### Tab 2 — Draft

- **Choose opening sentence** — click **Suggest opening sentences**. The AI returns **three** attention-grabbing openers **that reference the building blocks you selected** in Tab 1 (not generic ones). Each shows its *approach*, a *reason*, and a *recommendation*. Pick one with the radio button.
- **Create cover letter** — generates the full letter from: your global guidance + selected building blocks + chosen opening sentence + job-specific notes, in the correspondence language. Clicking it jumps straight to Tab 3, which shows a spinner until the letter arrives.

### Tab 3 — Result

The generated letter appears inline. **Only now** do these actions become available:

- **Copy** — copy subject + body to the clipboard
- **As Google Doc** — export a formatted Google Doc (uses the active *cover-letter* template from `/templates` if configured, matched to the correspondence language)
- **Review** — run an AI critique (see below)
- **Adjust** — regenerate with an extra instruction (creates a new version)

A **"Cover letter — version N / M"** line above the letter tells you exactly which stored version you are looking at.

---

## 3. Review

**Review** runs an AI critique of the *current* letter, styled like the app's other AI panels:

- **Overall impression**
- **Relevant strengths** (green) and **Improvements** (amber), side by side
- **Clichés** flagged as red badges
- **Tone · Length · Personalisation** summary line
- **Adjustment suggestions** — 2–4 ready-to-paste instructions. Click one to pre-fill the *Adjust* box, then regenerate.

If you configured guidance on `/letter-coach`, the review additionally checks the letter against it and reports deviations under *Improvements*.

### Which draft does the review refer to?

A review only describes the exact letter it ran against. The panel makes this explicit:

- When the review matches the shown letter → a green banner **"Refers to the current draft (version N)"**, and the **Review** button is disabled (nothing to re-check).
- After you create, adjust, or restore a different draft → the banner turns amber **"Refers to an earlier draft — please re-run"**, and the button re-enables as **"Refresh review"**.

This state is reload-safe and needs no manual tracking.

---

## 4. Version history

Every generation (Create *or* Adjust) is saved as a **version**. Expand the panel (maximize icon) to reveal a **version list** in a right-hand column:

- Each entry shows a version number, timestamp, and a short preview.
- The active version is highlighted.
- Click any version to **restore** it as the current letter — it becomes active again, and the review-freshness banner updates accordingly.

All versions are kept; nothing is discarded.

---

## 5. Correspondence language

Each application has a **correspondence language** (DE / EN), set with the language toggle in the CV stage. The entire cover-letter workflow — building blocks, opening sentences, the letter, and the review — is produced in that language, regardless of the app's UI language.

The toggle takes effect immediately: the language is sent with every AI request, so switching DE ↔ EN right before generating is respected without a race.

---

## 6. What feeds a generated letter — full picture

| Source | Where you edit it | Role |
|--------|-------------------|------|
| Master CV | Profile (`/profile`) | Primary factual basis |
| Personal notes | Profile (`/profile`) | Extra context, priorities |
| Documents library | Documents (`/documents`) | Certificates, references, portfolio — characterise your know-how |
| Cover-letter guidance | **Cover Letter (`/letter-coach`)** | Structure, values, strengths, style, no-gos, reference letter |
| Building blocks + opening sentence + job notes | Draft panel (per application) | Job-specific selection for this one letter |
| Correspondence language | CV-stage toggle | Output language |

---

## Tips

- **Invest in *Core strengths*.** Two or three strengths with real numbers beat a long list of adjectives — the AI can only cite evidence you give it.
- **Keep a good reference letter.** Pasting one you're proud of nudges tone and rhythm more effectively than describing them.
- **Use *To avoid* aggressively.** Listing the clichés you hate (e.g. "Hiermit bewerbe ich mich…") reliably keeps them out.
- **Select building blocks before opening sentences.** The openers reference your selection, so pick touchpoints/values/benefits first for sharper suggestions.
- **Review, then Adjust from the suggestions.** The review's suggestion chips are one click away from a targeted regeneration.

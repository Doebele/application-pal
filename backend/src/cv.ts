// ─── CV-Check: structured CV model helpers ────────────────────────────────────
// Pure functions only — the routes live in index.ts. The import turns the plain
// text of a CV (Google Doc export / PDF text) into a CvDocument via the LLM, then
// verifies deterministically that the model copied every text verbatim instead of
// rewriting or inventing it (verbatimWarnings).

import { randomUUID } from "node:crypto";
import { cvDocumentSchema, type CvDocument, type CvLanguage } from "@application-pal/shared";

export const CV_LANGS: CvLanguage[] = ["de", "en", "fr"];

/** Language of a CV from its file name or tags: "CV-2026-de", "…-en–…", "englisch", … */
export function detectCvLang(...texts: Array<string | null | undefined>): CvLanguage | null {
  for (const raw of texts) {
    const n = (raw ?? "").toLowerCase();
    if (!n) continue;
    const m = n.match(/(?:^|[^a-z])(de|en|fr)(?:[^a-z]|$)/);
    if (m) return m[1] as CvLanguage;
    if (/deutsch|german/.test(n)) return "de";
    if (/english|englisch/.test(n)) return "en";
    if (/fran[cç]ais|franz[oö]sisch|french/.test(n)) return "fr";
  }
  return null;
}

const shortId = () => randomUUID().replace(/-/g, "").slice(0, 10);

export const CV_IMPORT_SYSTEM_PROMPT = `Du bist ein Parser für Lebensläufe. Du erhältst den Rohtext eines Lebenslaufs und gibst seine Struktur als JSON zurück.

STRIKTE REGELN:
- Kopiere jeden Text WÖRTLICH aus dem Rohtext: nicht übersetzen, nicht umformulieren, nicht kürzen, nicht korrigieren (auch Tippfehler bleiben).
- Erfinde nichts. Fehlt eine Angabe, lass das Feld weg oder setze null.
- Aufzählungspunkte (•, *, -, –) sind "bullets", ohne das Aufzählungszeichen.
- Reihenfolge der Abschnitte und Einträge wie im Rohtext.
- Abschnitts-"title" = die Überschrift genau wie geschrieben.
- "kind" je Abschnitt: summary | experience | education | skills | certifications | languages | projects | achievements | other.
- Ein Profil-/Summary-Text gehört in basics.summary UND, falls er unter einer eigenen Überschrift steht, zusätzlich als Abschnitt kind "summary" mit einem Eintrag, dessen "text" der Absatz ist.
- Datumsangaben: "dateText" genau wie geschrieben; zusätzlich "start"/"end" normalisiert als "YYYY-MM" oder "YYYY", laufende Stelle als end "present".
- Skills-Gruppen: je Gruppe ein Eintrag, "title" = Gruppenname, "text" = Inhalt.
- basics.otherDetails: weitere Personalien wie geschrieben (Geburtsdatum, Nationalität, Zivilstand, Adresse …).
- Alle E-Mail-Adressen und Telefonnummern sammeln, die irgendwo vorkommen.

Antworte NUR mit JSON in diesem Format:
{
  "basics": { "name": "", "headline": "", "emails": [""], "phones": [""], "location": "", "linkedin": "", "website": "", "otherDetails": [""], "summary": "" },
  "sections": [
    { "kind": "experience", "title": "", "items": [
      { "title": "<Jobtitel/Abschluss>", "org": "<Firma/Schule>", "location": "", "dateText": "", "start": "", "end": "", "text": "", "bullets": ["<wörtlich>"] }
    ] }
  ]
}`;

type RawItem = { title?: unknown; org?: unknown; location?: unknown; start?: unknown; end?: unknown; dateText?: unknown; text?: unknown; bullets?: unknown };
type RawSection = { kind?: unknown; title?: unknown; items?: unknown };
type RawCv = { basics?: Record<string, unknown>; sections?: unknown };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((x): x is string => !!x) : []);
const SECTION_KINDS = new Set(["summary", "experience", "education", "skills", "certifications", "languages", "projects", "achievements", "other"]);

/** Normalises the LLM output into a valid CvDocument and assigns stable ids. */
export function normalizeParsedCv(raw: unknown): CvDocument {
  const r = (raw ?? {}) as RawCv;
  const b = r.basics ?? {};
  const sections = (Array.isArray(r.sections) ? r.sections as RawSection[] : []).map(s => ({
    id: shortId(),
    kind: (SECTION_KINDS.has(String(s.kind)) ? s.kind : "other") as CvDocument["sections"][number]["kind"],
    title: str(s.title) ?? "",
    items: (Array.isArray(s.items) ? s.items as RawItem[] : []).map(it => ({
      id: shortId(),
      title: str(it.title), org: str(it.org), location: str(it.location),
      start: str(it.start), end: str(it.end), dateText: str(it.dateText), text: str(it.text),
      bullets: strArr(it.bullets).map(text => ({ id: shortId(), text })),
    })),
  }));
  return cvDocumentSchema.parse({
    basics: {
      name: str(b.name), headline: str(b.headline), emails: strArr(b.emails), phones: strArr(b.phones),
      location: str(b.location), linkedin: str(b.linkedin), website: str(b.website),
      otherDetails: strArr(b.otherDetails), summary: str(b.summary),
    },
    sections,
  });
}

/** Lower-cased, whitespace-collapsed, quotes/dashes/bullet glyphs unified — for "was this copied verbatim?" */
export function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‚‛`´]/g, "'")
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/[•▪◦●*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type VerbatimWarning = { path: string; text: string };

/**
 * Every bullet, summary, title and paragraph must appear in the source text. Anything
 * that doesn't was rewritten or invented by the model and is reported so the user can
 * re-import or fix it. Long texts are compared by their first 60 characters, because
 * PDF/Doc text exports sometimes break a sentence across lines differently.
 */
export function verbatimWarnings(cv: CvDocument, sourceText: string): VerbatimWarning[] {
  const src = normalizeForCompare(sourceText);
  const found = (t: string) => {
    const n = normalizeForCompare(t);
    if (!n) return true;
    return src.includes(n) || (n.length > 60 && src.includes(n.slice(0, 60)));
  };
  const out: VerbatimWarning[] = [];
  const check = (path: string, t: string | null | undefined) => { if (t && !found(t)) out.push({ path, text: t }); };
  check("basics.name", cv.basics.name);
  check("basics.headline", cv.basics.headline);
  check("basics.summary", cv.basics.summary);
  cv.sections.forEach((s, si) => {
    check(`sections[${si}].title`, s.title);
    s.items.forEach((it, ii) => {
      check(`sections[${si}].items[${ii}].title`, it.title);
      check(`sections[${si}].items[${ii}].org`, it.org);
      check(`sections[${si}].items[${ii}].text`, it.text);
      it.bullets.forEach((bl, bi) => check(`sections[${si}].items[${ii}].bullets[${bi}]`, bl.text));
    });
  });
  return out;
}

export function cvStats(cv: CvDocument) {
  const experience = cv.sections.filter(s => s.kind === "experience");
  return {
    sections: cv.sections.length,
    positions: experience.reduce((n, s) => n + s.items.length, 0),
    bullets: cv.sections.reduce((n, s) => n + s.items.reduce((m, it) => m + it.bullets.length, 0), 0),
    words: [
      cv.basics.name, cv.basics.headline, cv.basics.location, cv.basics.summary, ...cv.basics.emails, ...cv.basics.phones,
      ...cv.sections.flatMap(s => [s.title, ...s.items.flatMap(it => [it.title, it.org, it.location, it.dateText, it.text, ...it.bullets.map(b => b.text)])]),
    ].filter(Boolean).join(" ").split(/\s+/).filter(Boolean).length,
  };
}

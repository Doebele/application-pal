// ─── LinkedIn-Check: what the local model does ────────────────────────────────
// 1) Judge: one call per check run scores the points code can't decide (headline
//    specialisation/benefit, About hook/proof/positioning, post topics, 3 AI-visibility
//    points), compares job titles with the CV, and drafts 3 headline variants.
// 2) Import: structures the text of a LinkedIn profile PDF ("Save to PDF") or of the
//    copied profile page into a LinkedInProfile — verbatim, nothing invented.
// Prompts + pure normalisers only; the routes and the background jobs live in index.ts.

import { randomUUID } from "node:crypto";
import { linkedInProfileSchema, type LinkedInProfile } from "@application-pal/shared";
import type { LiLlmJudgement, LiCvFacts, UiLang } from "./linkedin-rules.js";

const LANG_NAME: Record<UiLang, string> = { de: "Deutsch", en: "English", fr: "Français" };
const shortId = () => randomUUID().replace(/-/g, "").slice(0, 10);
const str = (v: unknown, max = 4000): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const strList = (v: unknown, max = 12, len = 300): string[] =>
  Array.isArray(v) ? v.map(x => str(x, len)).filter((x): x is string => !!x).slice(0, max) : [];
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && !Number.isNaN(+v) ? +v : null);

// ── 1) Judge ────────────────────────────────────────────────────
export type LiHeadlineVariant = { type: "authority" | "result" | "niche"; text: string };
export type LiJudgeExtras = {
  headlineVariants: LiHeadlineVariant[];
  cv: LiCvFacts | null;
  /** Client or employer names that may be under NDA (shown as a hint, never scored). */
  ndaHints: string[];
};

export function liJudgePrompt(uiLang: UiLang, hasCv: boolean): string {
  return `Du bewertest ein LinkedIn-Profil für eine Bewerbung. Antworte NUR mit JSON, ohne Erklärtext.
Begründungen ("notes") schreibst du auf ${LANG_NAME[uiLang]}, kurz (max. 20 Wörter je Punkt). Headline-Varianten in der Sprache des Profils.

Bewerte streng nach diesen Stufen (nur ganze Zahlen):
"headline": {
  "role": 2 = Zielrolle/Kernidentität steht in den ersten 60 Zeichen · 1 = vorhanden, aber weiter hinten · 0 = fehlt,
  "niche": 2 = eine Spezialisierung, die nicht jeder hat (Domäne, Methode, Branche) · 1 = vage · 0 = keine,
  "proof": 2 = Nutzen für eine Zielgruppe ODER ein Beleg (Name, Zahl) · 1 = angedeutet · 0 = keiner }
"about": {
  "hook": 3 = die ersten ~250 Zeichen sagen wer, für wen und was daraus wird · 2 = zwei davon · 1 = eins · 0 = Floskel/Lebenslauf-Einstieg,
  "proof": 3 = 2–4 konkrete Ergebnisse oder Namen (Produkte, Organisationen, Zahlen) · 2 = eines konkret · 1 = nur Behauptungen · 0 = keine,
  "positioning": 2 = klar, wofür man angefragt werden will · 1 = erkennbar, aber breit · 0 = unklar }
"posts": { "topics": 3 = mind. 2/3 der Beiträge zahlen auf die Positionierung ein · 2 = gut die Hälfte · 1 = wenige · 0 = keine Beiträge oder themenfremd }
"ai": { "niche": 1 = Nische spezifisch statt generisch,
        "consistent": 1 = Headline, Info, Positionen${hasCv ? " und CV" : ""} erzählen dieselbe Positionierung,
        "answerable": 1 = es gibt einen Satz wie „X ist <Rolle> für <Zielgruppe>", den man direkt zitieren kann }
Zu jedem Block "notes": je Punkt, der nicht die volle Punktzahl hat, EIN Satz, was fehlt oder stört — konkret am Text, Schlüssel = Name des Punkts. Volle Punktzahl → kein Eintrag.
${hasCv ? `
"cv": Vergleiche die Positionen auf LinkedIn mit dem Lebenslauf.
  "titleConflicts": [{"linkedin": "Titel auf LinkedIn", "cv": "Titel im CV für dieselbe Station"}] — nur echte Widersprüche derselben Station, keine Übersetzungen.
  "missingInLinkedIn": Ergebnisse oder Stationen aus dem CV, die auf LinkedIn fehlen (max. 5, wörtlich kurz zitiert).` : ""}

"headlineVariants": genau 3 Vorschläge, je max. 220 Zeichen, Zielrolle vorne, höchstens 4 Teile mit „|":
  {"type":"authority"} = Rolle + Erfahrung/Referenzen, {"type":"result"} = Rolle + Ergebnis für eine Zielgruppe, {"type":"niche"} = Rolle + Spezialgebiet.
  ERFINDE NICHTS: Zahlen, Namen, Firmen nur aus Profil${hasCv ? " oder CV" : ""}, sonst Platzhalter [X]. Keine Floskeln (leidenschaftlich, passionate, ergebnisorientiert …).
"ndaHints": Kundennamen im Profil, die unter Vertraulichkeit stehen könnten (nur Namen, max. 5; keine = leere Liste).

Format:
{"headline":{"role":0,"niche":0,"proof":0,"notes":{"proof":"…"}},"about":{"hook":0,"proof":0,"positioning":0,"notes":{"hook":"…"}},
 "posts":{"topics":0,"notes":{"topics":"…"}},"ai":{"niche":0,"consistent":0,"answerable":0},${hasCv ? `
 "cv":{"titleConflicts":[],"missingInLinkedIn":[]},` : ""}
 "headlineVariants":[{"type":"authority","text":"…"},{"type":"result","text":"…"},{"type":"niche","text":"…"}],"ndaHints":[]}`;
}

/** The profile as compact text for the judge (+ goal and CV facts). */
export function liJudgeInput(p: LinkedInProfile, opts: { targetRole?: string | null; market?: string | null; cvText?: string | null }): string {
  const b = p.basics;
  const lines: string[] = [];
  if (opts.targetRole) lines.push(`## Ziel\nZielrolle: ${opts.targetRole}${opts.market ? ` · Markt: ${opts.market}` : ""}`);
  lines.push(`## Headline\n${b.headline ?? "(leer)"}`);
  lines.push(`## Info\n${(b.summary ?? "(leer)").slice(0, 3000)}`);
  lines.push(`## Positionen\n${p.positions.slice(0, 8).map(x => `- ${[x.title, x.company].filter(Boolean).join(" · ")} (${x.start ?? "?"} – ${x.end ?? "heute"})${x.description ? `\n  ${x.description.slice(0, 600).replace(/\n/g, "\n  ")}` : ""}`).join("\n") || "(keine)"}`);
  if (p.skills.length) lines.push(`## Kenntnisse\n${p.skills.slice(0, 40).map(s => s.name).join(", ")}`);
  const posts = [...p.activity.posts].filter(x => x.text).slice(0, 12);
  lines.push(`## Beiträge (neueste zuerst, gekürzt)\n${posts.map(x => `- ${x.date ?? ""}: ${(x.text ?? "").slice(0, 280).replace(/\s+/g, " ")}`).join("\n") || "(keine)"}`);
  if (opts.cvText) lines.push(`## Lebenslauf (Auszug)\n${opts.cvText.slice(0, 8000)}`);
  return lines.join("\n\n");
}

const clampInt = (v: unknown, max: number) => { const n = num(v); return n === null ? null : Math.max(0, Math.min(max, Math.round(n))); };

/** Numbers in generated text must come from the sources: any figure not found there becomes [X]. */
export function guardNumbers(text: string, source: string): string {
  const digits = (s: string) => s.replace(/[^\d]/g, "");
  const known = new Set((source.match(/\d+(?:[.,'’]\d+)*/g) ?? []).map(digits));
  return text.replace(/\d+(?:[.,'’]\d+)*/g, m => (known.has(digits(m)) ? m : "[X]"));
}

/** Model answer → per-check judgements (only for points the model may decide) + extras.
 *  `source` = the judge input (profile + CV); figures in headline variants are checked against it. */
export function normalizeLiJudgement(raw: unknown, ctx: { hasCv: boolean; source?: string }): { llm: LiLlmJudgement; extras: LiJudgeExtras } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | unknown>;
  const block = (k: string) => ((r[k] && typeof r[k] === "object" ? r[k] : {}) as Record<string, unknown>);
  const llm: LiLlmJudgement = {};
  // Notes per point ({ proof: "…" }). An older list-shaped answer goes to the first missed point
  // of its block only, so the same sentence never repeats under every point.
  const judgeBlock = (b: Record<string, unknown>, prefix: string, points: Array<[string, number]>) => {
    const keyed = b.notes && typeof b.notes === "object" && !Array.isArray(b.notes) ? (b.notes as Record<string, unknown>) : null;
    let list = keyed ? [] : strList(b.notes, 3);
    for (const [key, max] of points) {
      const s = clampInt(b[key], max);
      if (s === null) continue;
      let findings: string[] = [];
      if (s < max) {
        if (keyed) findings = typeof keyed[key] === "string" ? [str(keyed[key], 300)].filter((x): x is string => !!x) : strList(keyed[key], 2);
        else { findings = list; list = []; }
      }
      llm[`${prefix}.${key}`] = { score: s, findings };
    }
  };
  const ai = block("ai");
  judgeBlock(block("headline"), "headline", [["role", 2], ["niche", 2], ["proof", 2]]);
  judgeBlock(block("about"), "about", [["hook", 3], ["proof", 3], ["positioning", 2]]);
  judgeBlock(block("posts"), "posts", [["topics", 3]]);
  for (const k of ["niche", "consistent", "answerable"]) { const s = clampInt(ai[k], 1); if (s !== null) llm[`ai.${k}`] = { score: s, findings: [] }; }

  const cvB = block("cv");
  const cv: LiCvFacts | null = ctx.hasCv ? {
    titleConflicts: (Array.isArray(cvB.titleConflicts) ? cvB.titleConflicts : [])
      .map(x => (x && typeof x === "object" ? { linkedin: str((x as Record<string, unknown>).linkedin, 160), cv: str((x as Record<string, unknown>).cv, 160) } : null))
      .filter((x): x is { linkedin: string; cv: string } => !!x?.linkedin && !!x.cv && x.linkedin.toLowerCase() !== x.cv.toLowerCase()).slice(0, 6),
    missingInLinkedIn: strList(cvB.missingInLinkedIn, 5, 200),
  } : null;

  const types = ["authority", "result", "niche"] as const;
  const variants = (Array.isArray(r.headlineVariants) ? r.headlineVariants : [])
    .map((x, i) => {
      const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      const type = types.includes(o.type as typeof types[number]) ? (o.type as LiHeadlineVariant["type"]) : types[i] ?? "niche";
      const raw = str(o.text, 240);
      const text = raw && ctx.source !== undefined ? guardNumbers(raw, ctx.source) : raw;
      return text ? { type, text } : null;
    }).filter((x): x is LiHeadlineVariant => !!x).slice(0, 3);
  return { llm, extras: { headlineVariants: variants, cv, ndaHints: strList(r.ndaHints, 5, 80) } };
}

// ── 2) Import from PDF / copied page text ─────────────────────────
export const LI_IMPORT_SYSTEM_PROMPT = `Du strukturierst den Text eines LinkedIn-Profils (PDF-Export „Als PDF speichern" oder kopierte Profilseite) als JSON. Antworte NUR mit JSON.
Regeln:
- Übernimm Texte WÖRTLICH (Headline, Info, Positionsbeschreibungen). Nichts umformulieren, nichts kürzen, nichts ergänzen, nichts übersetzen.
- Was nicht im Text steht, lässt du weg (null oder leere Liste). NIEMALS raten oder erfinden.
- Daten genau wie im Text („Jan. 2022", „März 2019", „2016"); laufende Station: "end": null.
- Seitenzahlen („Page 1 of 3"), Navigation, Buttons, Werbung und „… mehr anzeigen" ignorieren.
- "sectionsFound": welche Abschnitte im Text vorkommen, aus: about, experience, education, skills, certifications, languages, honors, projects, publications, volunteering.
- "connections": die angezeigte Kontaktzahl als Text (z. B. "500+"), sonst null.
Format:
{"basics":{"firstName":null,"lastName":null,"headline":null,"summary":null,"location":null,"publicUrl":null,"websites":[]},
 "positions":[{"title":null,"company":null,"location":null,"start":null,"end":null,"description":null}],
 "education":[{"school":null,"degree":null,"start":null,"end":null}],
 "skills":[{"name":"…"}],"certifications":[{"name":"…","authority":null,"start":null}],"languages":[{"name":"…","proficiency":null}],
 "honors":[{"title":"…","issuer":null,"date":null}],"projects":[{"title":"…","description":null,"url":null}],
 "publications":[{"title":"…","publisher":null,"date":null}],"volunteering":[{"role":null,"organization":null,"description":null}],
 "connections":null,"sectionsFound":[]}`;

const SECTION_DOMAIN: Record<string, string> = {
  certifications: "CERTIFICATIONS", languages: "LANGUAGES", honors: "HONORS", projects: "PROJECTS",
  publications: "PUBLICATIONS", volunteering: "VOLUNTEERING_EXPERIENCES",
};
/** What the LinkedIn PDF export always contains (even when empty). Skills are only the top 3 there → not rated. */
const PDF_DOMAINS = ["PROFILE", "POSITIONS", "EDUCATION", "CERTIFICATIONS", "LANGUAGES", "HONORS", "PUBLICATIONS"];

export function normalizeImportedProfile(raw: unknown, opts: { source: "pdf" | "text"; text: string; publicUrl?: string | null; fetchedAt?: string }): LinkedInProfile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const b = (r.basics && typeof r.basics === "object" ? r.basics : {}) as Record<string, unknown>;
  const arr = (k: string) => (Array.isArray(r[k]) ? (r[k] as unknown[]).filter(x => x && typeof x === "object") as Record<string, unknown>[] : []);
  const urlInText = opts.text.match(/(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/in\/[\w%-]+/i)?.[0] ?? null;
  const conn = str(r.connections, 20);
  const connections = conn ? num(conn.replace(/[^\d]/g, "")) : null;
  const sections = strList(r.sectionsFound, 12, 30).map(s => s.toLowerCase());
  const present = opts.source === "pdf"
    ? PDF_DOMAINS
    : ["PROFILE", "POSITIONS", "EDUCATION", ...sections.map(s => SECTION_DOMAIN[s]).filter(Boolean)];
  if (connections !== null) present.push("CONNECTIONS");

  return linkedInProfileSchema.parse({
    basics: {
      firstName: str(b.firstName, 80), lastName: str(b.lastName, 80), headline: str(b.headline, 300), summary: str(b.summary, 4000),
      location: str(b.location, 120), industry: null,
      publicUrl: str(b.publicUrl, 200) ?? urlInText ?? opts.publicUrl ?? null,
      websites: strList(b.websites, 6, 200).filter(w => !/linkedin\.com\/in\//i.test(w)),
    },
    positions: arr("positions").map(x => ({ id: shortId(), title: str(x.title, 160), company: str(x.company, 160), location: str(x.location, 120), description: str(x.description, 4000), start: str(x.start, 40), end: str(x.end, 40) }))
      .filter(x => x.title || x.company),
    education: arr("education").map(x => ({ id: shortId(), school: str(x.school, 160), degree: str(x.degree, 200), notes: null, activities: null, start: str(x.start, 40), end: str(x.end, 40) }))
      .filter(x => x.school || x.degree),
    skills: arr("skills").map(x => str(x.name, 80)).filter((x): x is string => !!x).map(name => ({ name, endorsements: null })),
    certifications: arr("certifications").map(x => ({ id: shortId(), name: str(x.name, 200) ?? "", authority: str(x.authority, 160), url: null, start: str(x.start, 40), end: null })).filter(x => x.name),
    languages: arr("languages").map(x => ({ name: str(x.name, 60) ?? "", proficiency: str(x.proficiency, 80) })).filter(x => x.name),
    honors: arr("honors").map(x => ({ id: shortId(), title: str(x.title, 200) ?? "", issuer: str(x.issuer, 160), date: str(x.date, 40), description: null })).filter(x => x.title),
    projects: arr("projects").map(x => ({ id: shortId(), title: str(x.title, 200) ?? "", description: str(x.description, 2000), url: str(x.url, 300), start: null, end: null })).filter(x => x.title),
    publications: arr("publications").map(x => ({ id: shortId(), title: str(x.title, 300) ?? "", publisher: str(x.publisher, 160), date: str(x.date, 40), description: null, url: null })).filter(x => x.title),
    courses: [],
    volunteering: arr("volunteering").map(x => ({ id: shortId(), role: str(x.role, 160), organization: str(x.organization, 160), cause: null, description: str(x.description, 2000), start: null, end: null })),
    recommendations: { received: [], givenCount: null },
    activity: { posts: [], comments: [], articles: [] },
    network: { connections, groups: [] },
    meta: {
      source: opts.source, fetchedAt: opts.fetchedAt ?? new Date().toISOString(),
      notProvided: ["photo", "banner", "featured", "openTo", "recommendations", "activity"],
      failed: [], present: [...new Set(present)],
    },
  });
}

/** Texts the model returned that are not in the source word for word (whitespace-insensitive). */
export function liVerbatimWarnings(p: LinkedInProfile, text: string): string[] {
  const flat = (s: string) => s.toLowerCase().replace(/[\s ]+/g, " ").replace(/[„"“”‚‘’']/g, "").trim();
  const src = flat(text);
  const out: string[] = [];
  const probe = (label: string, v: string | null | undefined) => {
    if (!v) return;
    const head = flat(v).slice(0, 80);
    if (head && !src.includes(head)) out.push(`${label}: „${v.slice(0, 60)}${v.length > 60 ? "…" : ""}"`);
  };
  probe("Headline", p.basics.headline);
  probe("Info", p.basics.summary);
  p.positions.forEach(x => { probe("Position", x.title); probe("Beschreibung", x.description); });
  return out.slice(0, 10);
}

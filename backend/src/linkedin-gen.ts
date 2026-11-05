// ─── LinkedIn-Check: text generator ("Profil schärfen" / "Profil aufbauen") ───────
// A confirmed positioning sentence comes first; the texts are then written in four
// short calls (intro, positions, skills, activity) so a local model stays fast and one
// failing part does not lose the others. Prompts + pure normalisers only; the routes
// and background jobs live in index.ts.
//
// LinkedIn keeps one profile per language: a draft belongs to one language. Its base is
// the imported profile of that language, else one of another language (then only the
// structure — titles, companies, dates — is kept and the texts are written anew), else
// nothing (built from CV, documents and the user's answers).
//
// Rules — don't "fix" them:
// - Nothing is invented: a figure not found in the sources becomes [X]; companies and
//   dates of new positions must appear in the sources, else [X].
// - Skills without evidence in the sources stay in the draft but are flagged.
// - Featured items never get a link that is not in the sources.
// - Groups: criteria and search terms only, never group names.

import { linkedInProfileSchema, type LinkedInProfile, type LinkedInLang } from "@application-pal/shared";
import { phrasesIn } from "./linkedin-rules.js";
import { guardNumbers, type LiHeadlineVariant } from "./linkedin-llm.js";
import { LI_CRITERIA } from "./linkedin-criteria.js";

export const LI_GEN_PARTS = ["intro", "positions", "skills", "activity"] as const;
export type LiGenPart = typeof LI_GEN_PARTS[number];
export const LI_GEN_LANGS: readonly LinkedInLang[] = ["de", "en", "fr"];

export type LiFeatured = { title: string; kind: "link" | "post" | "document" | "media"; why: string | null; url: string | null };
export type LiRecRequest = { to: string; text: string };
export type LiPillar = { title: string; why: string | null; ideas: string[] };
export type LiGroups = { criteria: string[]; searchTerms: string[] };
export type LiPlanWeek = { week: number; tasks: string[] };
export type LiDraftSkill = { name: string; verified: boolean };

/** Generator state of a draft, stored in linkedin_versions.raw (origin "draft"). */
export type LiDraftRaw = {
  kind: "draft";
  lang: LinkedInLang;
  baseVersionId: string | null;
  baseLang: string | null;
  positioning: string | null;
  applicationId: string | null;
  updatedAt: string;
  generated: Partial<Record<LiGenPart, string>>;
  errors: Partial<Record<LiGenPart, string>>;
  headlineVariants: LiHeadlineVariant[];
  skills: LiDraftSkill[];
  positionSkills: Record<string, string[]>;
  featured: LiFeatured[];
  recRequests: LiRecRequest[];
  pillars: LiPillar[];
  groups: LiGroups | null;
  plan: LiPlanWeek[];
  ndaHints: string[];
  warnings: string[];
};

// Questions of the build/sharpen step (keys stored in linkedin_state.answers).
// Career starters (persona "berufseinsteiger") get their own questions instead of audience/outcomes.
export const LI_ANSWER_KEYS = ["strengths", "audience", "outcomes", "education", "practice", "askedFor", "avoid"] as const;
const ANSWER_LABEL: Record<typeof LI_ANSWER_KEYS[number], string> = {
  strengths: "Was ich besonders gut kann",
  audience: "Für wen ich arbeite / wem ich helfe",
  outcomes: "Ergebnisse und Projekte, auf die ich stolz bin",
  education: "Ausbildung / Studium: Schwerpunkt, Abschlussarbeit, Projekte",
  practice: "Praktika, Nebenjobs, Ehrenamt, eigene Projekte",
  askedFor: "Wofür ich angefragt werden möchte",
  avoid: "Was NICHT ins Profil soll (z. B. vertrauliche Kunden)",
};
export function liAnswersText(answers: Record<string, string> | null | undefined, beginner = false): string {
  const label = (k: typeof LI_ANSWER_KEYS[number]) => (beginner && k === "askedFor" ? "Gesuchte Einstiegsstelle (Rolle, Art: Festanstellung, Trainee, Praktikum)" : ANSWER_LABEL[k]);
  const lines = LI_ANSWER_KEYS.map(k => (answers?.[k]?.trim() ? `- ${label(k)}: ${answers[k].trim()}` : null)).filter(Boolean);
  return lines.length ? `## Antworten des Nutzers\n${lines.join("\n")}` : "";
}

// ── helpers ─────────────────────────────────────────────────────
const str = (v: unknown, max = 4000): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const strList = (v: unknown, max = 12, len = 300): string[] =>
  Array.isArray(v) ? v.map(x => str(x, len)).filter((x): x is string => !!x).slice(0, max) : [];
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const norm = (s: string) => s.toLocaleLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/\s+/g, " ").trim();
/** True when `needle` occurs in the sources (case/accent/space-insensitive). */
const inSource = (needle: string, source: string) => !!needle.trim() && norm(source).includes(norm(needle));
const guard = (t: string | null, source: string) => (t ? guardNumbers(t, source) : t);

const LANG_DIRECTIVE: Record<LinkedInLang, string> = {
  de: "WICHTIG: Schreibe ALLE Texte ausschliesslich auf Deutsch, unabhängig von der Sprache der Quellen und der Anweisungen.",
  en: "IMPORTANT: Write ALL texts strictly in English, regardless of the language of the sources and the instructions.",
  fr: "IMPORTANT : rédige TOUS les textes exclusivement en français, quelle que soit la langue des sources et des instructions.",
};

const LANG_FIELDS: Record<LinkedInLang, string> = {
  de: "Das gilt für jedes Textfeld im JSON, auch kurze wie \"why\", \"to\", \"angle\" und \"title\".",
  en: "This applies to every text field in the JSON, including short ones such as \"why\", \"to\", \"angle\" and \"title\".",
  fr: "Cela vaut pour chaque champ de texte du JSON, y compris les champs courts comme \"why\", \"to\", \"angle\" et \"title\".",
};

const RULES = `REGELN (verbindlich):
- ERFINDE NICHTS. Zahlen, Namen, Firmen, Kunden, Produkte, Daten und Titel nur, wenn sie in den Quellen stehen. Fehlt ein Wert, schreibe den Platzhalter [X] (z. B. „Durchlaufzeit um [X] % gesenkt").
- Keine unbelegten Statistiken, keine Marktzahlen, keine Preise.
- Keine Floskeln (leidenschaftlich, ergebnisorientiert, innovativ, passionate, results-driven, passionné …) und kein Einstieg mit „Über X Jahre Erfahrung".
- Übernimm die Tonalität des Nutzers (Abschnitt „Tonalität"), keine Werbesprache.
- Was der Nutzer unter „Was NICHT ins Profil soll" nennt, kommt nicht vor.
- Antworte NUR mit JSON, ohne Erklärtext.`;

// The directive comes first AND last: the prompt body is German, and local models otherwise
// drift back to German in short free-text fields ("why", "to") of an English draft.
const head = (lang: LinkedInLang, task: string) => `${LANG_DIRECTIVE[lang]}\n\n${task}\n\n${RULES}\n\n${LANG_DIRECTIVE[lang]} ${LANG_FIELDS[lang]}`;

// Career starters (persona "berufseinsteiger"): little or no work experience, so education,
// internships, projects and volunteering carry the profile. Appended to each task.
const BEGINNER = "BERUFSEINSTIEG: Der Nutzer steigt gerade ins Berufsleben ein und hat wenig oder keine Berufserfahrung. Erfinde keine Berufserfahrung und keine Verantwortung, die er nicht hatte.";
const BEGINNER_TASK = {
  positioning: `${BEGINNER} Form stattdessen: „<angestrebte Einstiegsrolle> mit <Ausbildung/Schwerpunkt>, <was er mitbringt: Projekt, Praktikum, Fähigkeit>". Keine Jahresangaben zur Erfahrung.`,
  intro: `${BEGINNER} Headline: angestrebte Einstiegsrolle zuerst, dann Abschluss/Studium (mit Abschlussjahr, falls in den Quellen) und Schwerpunkt — nie nur „Student:in" oder „auf Jobsuche"; „Junior"/„Trainee" nur, wenn es zur gesuchten Stelle passt. {"type":"authority"} = Rolle + Ausbildung · {"type":"result"} = Rolle + Projekt/Ergebnis aus Studium oder Praktikum · {"type":"niche"} = Rolle + Schwerpunkt. About: Hook = was er werden will und was er mitbringt; Belege = Abschlussarbeit, Projekte, Praktika, Ehrenamt; Abschluss = welche Einstiegsstelle er sucht und ab wann (nur wenn in den Quellen).`,
  positions: `${BEGINNER} Positionen sind Praktika, Werkstudenten- und Nebenjobs, Lehre; Ehrenamt gehört NICHT in "positions", sondern in "volunteering": [{"role","organization","start","end","description"}]. Beschreibungen: 2–4 Zeilen, was er getan, gelernt und beigetragen hat — nicht aufblasen. Gibt es keine Stelle, ist "positions" eine leere Liste. "education" ist hier der wichtigste Abschnitt: je Eintrag zusätzlich "notes" (1–3 Sätze: Schwerpunkt, Abschlussarbeit, Projekte; Noten nur, wenn in den Quellen).`,
  skills: `${BEGINNER} Kenntnisse aus Ausbildung, Projekten, Praktika und Kursen zählen voll. "featured": Abschlussarbeit, Studien- und eigene Projekte, Portfolio, Zertifikate.`,
  activity: `${BEGINNER} Empfehlungen: Praktikumsbetreuung, Dozent:innen, Projektleitung, Ehrenamts-Leitung. Plan: Woche 1 Profil fertigstellen; dann Kontakte aus Studium, Praktika und Ehrenamt mit persönlicher Nachricht, Zielunternehmen folgen, Karriere-Events und Alumni-Netzwerk; Beiträge über Projekte und Gelerntes.`,
} as const;
const withBeginner = (task: string, part: keyof typeof BEGINNER_TASK, beginner: boolean) => (beginner ? `${task}\n\n${BEGINNER_TASK[part]}` : task);

// ── prompts ─────────────────────────────────────────────────────
export function liPositioningPrompt(lang: LinkedInLang, beginner = false): string {
  return head(lang, withBeginner(`Du hilfst, einen LinkedIn-Auftritt zu schärfen. Leite aus den Quellen genau 3 Positionierungssätze ab.
Form: ein Satz, max. 220 Zeichen: „<Rolle> für <Zielgruppe>, <was daraus wird / womit>". Jeder Satz mit anderem Schwerpunkt ("angle": z. B. Branche, Methode, Ergebnis).
Zielrolle und Antworten des Nutzers haben Vorrang; nur was die Quellen tragen.
Format: {"options":[{"text":"…","angle":"…"}]}`, "positioning", beginner));
}

export function liIntroPrompt(lang: LinkedInLang, beginner = false): string {
  const a = LI_CRITERIA.about;
  return head(lang, withBeginner(`Schreibe Headline und Info-Text (About) für LinkedIn. Grundlage ist die bestätigte Positionierung.
"headlineVariants": genau 3, je max. 220 Zeichen, Zielrolle in den ersten ${LI_CRITERIA.headlineMobileChars} Zeichen, höchstens ${LI_CRITERIA.headlineMaxParts} Teile mit „|", Suchbegriffe der Zielrolle, nicht nur „Titel bei Firma":
  {"type":"authority"} = Rolle + Erfahrung/Referenzen · {"type":"result"} = Rolle + Ergebnis für eine Zielgruppe · {"type":"niche"} = Rolle + Spezialgebiet.
"about": ${a.minChars}–2000 Zeichen, 3–6 kurze Absätze mit Leerzeile dazwischen:
  1. Hook in den ersten ${a.hookChars} Zeichen: wer, für wen, was daraus wird.
  2. 2–4 Belege: konkrete Ergebnisse, Projekte, Organisationen aus den Quellen.
  3. Schwerpunkte / Arbeitsweise (optional kurze Liste mit „–").
  4. Abschluss: wofür man dich anfragen soll und wie (Aufruf zur Kontaktaufnahme).
  Nicht mit dem Namen beginnen („Mein Name ist …"), jede Aussage nur einmal (den Hook am Ende nicht wiederholen), Anrede (du/Sie) wie im bisherigen Profil.
"ndaHints": Kundennamen, die du verwendet hast (sonst leere Liste).
Format: {"headlineVariants":[{"type":"authority","text":"…"},{"type":"result","text":"…"},{"type":"niche","text":"…"}],"about":"…","ndaHints":[]}`, "intro", beginner));
}

export function liPositionsPrompt(lang: LinkedInLang, mode: "rewrite" | "translate" | "build", beginner = false): string {
  const how = mode === "rewrite"
    ? `Überarbeite die Beschreibungen der vorhandenen Positionen (Abschnitt „Positionen", "ref" = die id in eckigen Klammern). Titel, Firma und Daten bleiben unverändert.`
    : mode === "translate"
      ? `Schreibe die Beschreibungen der vorhandenen Positionen (Abschnitt „Positionen", "ref" = die id in eckigen Klammern) in der Zielsprache neu. Den Titel übersetzt du sinngemäss ("title"); Firma und Daten bleiben.`
      : `Lege die Stationen aus dem Lebenslauf an, neueste zuerst: "title", "company", "start", "end" (null = heute) genau wie im Lebenslauf. "ref" = null.
Lege auch die Ausbildung aus dem Lebenslauf an ("education": school, degree, start, end — genau wie im Lebenslauf).`;
  return head(lang, withBeginner(`${how}
"description": aktuelle und letzte Station je 3–5 Ergebnis-Sätze (jede Zeile beginnt mit „– "), Zahlen nur aus den Quellen, sonst [X]; ältere Stationen 1–2 Sätze (max. ${LI_CRITERIA.experience.olderMaxChars} Zeichen). Max. 2000 Zeichen je Station.
Belege aus Lebenslauf und Dokumenten gehören nur zu der Station mit derselben Firma (bzw. demselben Zeitraum). Verschiebe nie Leistungen zwischen Arbeitgebern; gibt es zu einer Station keinen passenden Beleg, bleib bei ihrer bisherigen Beschreibung und setze [X] statt Zahlen.
"skills": 3–5 Kenntnisse je Station, die dort belegt sind.
"ndaHints": Kundennamen, die du verwendet hast.
Format: {"positions":[{"ref":"…","title":"…","company":"…","start":"…","end":null,"description":"…","skills":[]}],"education":[],${beginner && mode === "build" ? `"volunteering":[],` : ""}"ndaHints":[]}`, "positions", beginner));
}

export function liSkillsPrompt(lang: LinkedInLang, beginner = false): string {
  return head(lang, withBeginner(`"skills": ${LI_CRITERIA.skills.full}–50 Kenntnisse für LinkedIn, die ${LI_CRITERIA.skills.topN} wichtigsten zuerst (passend zu Zielrolle und Headline). Nur Kenntnisse, die in den Quellen belegt sind, je mit kurzem wörtlichem Zitat als "evidence".
  Jede Kenntnis ist EIN gängiger LinkedIn-Skill (1–3 Wörter, z. B. „Figma", „Design Thinking", „Barrierefreiheit") — nie zwei Kenntnisse zu einem Begriff zusammenfügen („Figma FigJam proficiency" ist falsch: „Figma" und „FigJam" einzeln), keine Zusätze wie „proficiency", „methodology", „tracking". Stehen Begriffe unter „Kenntnisse laut Lebenslauf", übernimm sie wörtlich. Erworbene Zertifikate dürfen ihre Themen als Kenntnis belegen.
"featured": 3–6 Vorschläge für „Im Fokus", die stärksten zwei zuerst. Nur Dinge, die in den Quellen existieren (Portfolio, Projekte, Publikationen, Dokumente, Beiträge). "url" nur, wenn sie wörtlich in den Quellen steht, sonst null. "kind": link | post | document | media. "why": ein Satz, warum es die Positionierung belegt.
Format: {"skills":[{"name":"…","evidence":"…"}],"featured":[{"title":"…","kind":"link","why":"…","url":null}]}`, "skills", beginner));
}

export function liActivityPrompt(lang: LinkedInLang, beginner = false): string {
  return head(lang, withBeginner(`"recommendationRequests": 3 kurze Bitten um eine Empfehlung (max. 600 Zeichen). "to" = Beziehung, z. B. „ehemalige Vorgesetzte bei <Firma aus den Quellen>". "text" mit Platzhalter [Name] und einem konkreten gemeinsamen Projekt aus den Quellen (sonst [Projekt]); sag, welche Fähigkeit die Empfehlung belegen soll.
"pillars": 3–4 Themensäulen für Beiträge, passend zur Positionierung: {"title","why","ideas":[3 Beitragsideen, je ein Satz]}.
"groups": NUR Kriterien und Suchbegriffe, mit denen der Nutzer passende Gruppen selbst findet — KEINE Gruppennamen: {"criteria":[…],"searchTerms":[…]}.
"plan": 4-Wochen-Plan, je Woche 3–5 konkrete Aufgaben (Profil fertigstellen, Netzwerk, Beiträge, Kommentare, Empfehlungen): [{"week":1,"tasks":["…"]}].
Format: {"recommendationRequests":[{"to":"…","text":"…"}],"pillars":[{"title":"…","why":"…","ideas":[]}],"groups":{"criteria":[],"searchTerms":[]},"plan":[{"week":1,"tasks":[]}]}`, "activity", beginner));
}

/** All sources as one text block. Numbers and names in the output are checked against exactly this text. */
export function liGenInput(o: {
  profile: LinkedInProfile | null; profileLang?: string | null; positioning?: string | null;
  goal?: { targetRole?: string | null; market?: string | null; kind?: string | null } | null;
  answers?: Record<string, string> | null; cvText?: string | null; docs?: string | null;
  jobAd?: { company?: string | null; role?: string | null; description?: string | null } | null;
  toneSample?: string | null;
  /** liSourceFactsText(): verbatim skills, certificates, languages from CV + Documents. */
  sourceFacts?: string | null;
  /** Persona "berufseinsteiger": answers use the career-starter labels. */
  beginner?: boolean;
}): string {
  const out: string[] = [];
  const g = o.goal;
  if (g?.targetRole || g?.market) out.push(`## Ziel\n${[g.targetRole && `Zielrolle: ${g.targetRole}`, g.market && `Markt: ${g.market}`, g.kind && `Ziel: ${g.kind}`].filter(Boolean).join(" · ")}`);
  if (o.positioning) out.push(`## Bestätigte Positionierung\n${o.positioning}`);
  const ans = liAnswersText(o.answers, o.beginner);
  if (ans) out.push(ans);
  const p = o.profile;
  if (p) {
    out.push(`## Aktuelles LinkedIn-Profil${o.profileLang ? ` (Sprache: ${o.profileLang})` : ""}\nHeadline: ${p.basics.headline ?? "(leer)"}\nInfo:\n${(p.basics.summary ?? "(leer)").slice(0, 3000)}`);
    out.push(`## Positionen\n${p.positions.slice(0, 12).map(x => `- [${x.id}] ${[x.title, x.company].filter(Boolean).join(" · ")} (${x.start ?? "?"} – ${x.end ?? "heute"})${x.description ? `\n  ${x.description.slice(0, 900).replace(/\n/g, "\n  ")}` : ""}`).join("\n") || "(keine)"}`);
    if (p.education.length) out.push(`## Ausbildung\n${p.education.map(e => `- ${[e.degree, e.school].filter(Boolean).join(" · ")} (${e.start ?? "?"} – ${e.end ?? "?"})`).join("\n")}`);
    if (p.skills.length) out.push(`## Kenntnisse\n${p.skills.slice(0, 60).map(s => s.name).join(", ")}`);
    const extra = [...p.projects.map(x => `Projekt: ${x.title}${x.url ? ` (${x.url})` : ""}`), ...p.publications.map(x => `Publikation: ${x.title}${x.url ? ` (${x.url})` : ""}`),
      ...p.certifications.map(x => `Zertifikat: ${x.name}`), ...p.basics.websites.map(w => `Website: ${w}`)];
    if (extra.length) out.push(`## Weitere Einträge\n${extra.slice(0, 30).map(x => `- ${x}`).join("\n")}`);
  }
  if (o.sourceFacts) out.push(o.sourceFacts.slice(0, 4000));
  if (o.cvText) out.push(`## Lebenslauf\n${o.cvText.slice(0, 9000)}`);
  if (o.docs) out.push(o.docs.slice(0, 5000));
  if (o.jobAd?.description) out.push(`## Stellenanzeige, auf die zugeschnitten wird${o.jobAd.role ? ` (${o.jobAd.role}${o.jobAd.company ? ` bei ${o.jobAd.company}` : ""})` : ""}\n${o.jobAd.description.slice(0, 4000)}`);
  if (o.toneSample) out.push(`## Tonalität (eigene Texte des Nutzers, nur als Stilvorbild)\n${o.toneSample.slice(0, 1500)}`);
  return out.join("\n\n");
}

// ── normalisers ─────────────────────────────────────────────────
export function normalizePositioning(raw: unknown, source: string): Array<{ text: string; angle: string | null }> {
  return arr(obj(raw).options).map(x => {
    const o = obj(x);
    const text = guard(str(o.text, 300), source);
    return text ? { text, angle: str(o.angle, 60) } : null;
  }).filter((x): x is { text: string; angle: string | null } => !!x).slice(0, 3);
}

const HEADLINE_TYPES = ["authority", "result", "niche"] as const;
export function normalizeIntro(raw: unknown, source: string) {
  const r = obj(raw);
  const variants: LiHeadlineVariant[] = arr(r.headlineVariants).map((x, i) => {
    const o = obj(x);
    const type = (HEADLINE_TYPES as readonly string[]).includes(String(o.type)) ? o.type as LiHeadlineVariant["type"] : HEADLINE_TYPES[i] ?? "niche";
    const text = guard(str(o.text, 220), source);
    return text ? { type, text } : null;
  }).filter((x): x is LiHeadlineVariant => !!x).slice(0, 3);
  const about = guard(str(r.about, LI_CRITERIA.about.maxChars), source);
  const warnings: string[] = [];
  const ph = [...new Set([...phrasesIn(about ?? "", "all"), ...variants.flatMap(v => phrasesIn(v.text, "all"))])];
  if (ph.length) warnings.push(`phrases:${ph.join(", ")}`);
  if (about && about.length < LI_CRITERIA.about.minChars) warnings.push(`aboutShort:${about.length}`);
  return { headline: variants[0]?.text ?? null, headlineVariants: variants, about, ndaHints: strList(r.ndaHints, 5, 80), warnings };
}

type Positions = LinkedInProfile["positions"];
type Education = LinkedInProfile["education"];
type Volunteering = LinkedInProfile["volunteering"];
const posId = () => Math.random().toString(36).slice(2, 12);

/** Positions answer → positions of the draft. `base` = positions the draft starts from (none when built from the CV). */
export function normalizePositionsAnswer(raw: unknown, source: string, base: { positions: Positions; education: Education; translate: boolean }) {
  const r = obj(raw);
  const items = arr(r.positions).map(obj);
  const warnings: string[] = [];
  const positionSkills: Record<string, string[]> = {};
  let positions: Positions;
  let education: Education | null = null;
  let volunteering: Volunteering | null = null;
  if (base.positions.length) {
    positions = base.positions.map((p, i) => {
      const a = items.find(x => String(x.ref ?? "") === p.id) ?? (items.every(x => !x.ref) ? items[i] : undefined);
      if (!a) return p;
      positionSkills[p.id] = strList(a.skills, 5, 60);
      return {
        ...p,
        title: base.translate ? (str(a.title, 160) ?? p.title) : p.title,
        description: guard(str(a.description, 2000), source) ?? p.description,
      };
    });
  } else {
    // Built from the CV: company and dates must be in the sources.
    const keep = (v: unknown, what: string) => {
      const s = str(v, 160);
      if (!s) return null;
      if (inSource(s, source)) return s;
      warnings.push(`unverified:${what}:${s}`);
      return "[X]";
    };
    positions = items.slice(0, 12).map(a => {
      const id = posId();
      positionSkills[id] = strList(a.skills, 5, 60);
      return {
        id, title: str(a.title, 160), company: keep(a.company, "company"), location: null,
        description: guard(str(a.description, 2000), source),
        start: guard(str(a.start, 40), source), end: guard(str(a.end, 40), source),
      };
    }).filter(p => p.title || p.company);
    if (!base.education.length) {
      education = arr(r.education).map(obj).slice(0, 8).map(a => ({
        id: posId(), school: keep(a.school, "school"), degree: str(a.degree, 200), notes: guard(str(a.notes, 1000), source), activities: null,
        start: guard(str(a.start, 40), source), end: guard(str(a.end, 40), source),
      })).filter(e => e.school || e.degree);
    }
    // Career starters: volunteering is its own LinkedIn section (organisation must be in the sources).
    const vol = arr(r.volunteering).map(obj).slice(0, 8).map(a => ({
      id: posId(), role: str(a.role, 160), organization: keep(a.organization, "organization"), cause: null,
      description: guard(str(a.description, 2000), source), start: guard(str(a.start, 40), source), end: guard(str(a.end, 40), source),
    })).filter(v => v.role || v.organization);
    if (vol.length) volunteering = vol;
  }
  return { positions, education, volunteering, positionSkills, ndaHints: strList(r.ndaHints, 5, 80), warnings };
}

export function normalizeSkillsAnswer(raw: unknown, source: string) {
  const r = obj(raw);
  const seen = new Set<string>();
  const skills: LiDraftSkill[] = [];
  for (const x of arr(r.skills)) {
    const o = typeof x === "string" ? { name: x } : obj(x);
    const name = str(o.name, 80);
    if (!name || name.split(/\s+/).length > 6 || seen.has(norm(name))) continue;
    seen.add(norm(name));
    const ev = str(o.evidence, 200);
    skills.push({ name, verified: inSource(name, source) || (!!ev && inSource(ev.slice(0, 60), source)) });
    if (skills.length >= 50) break;
  }
  const kinds = ["link", "post", "document", "media"] as const;
  const featured: LiFeatured[] = arr(r.featured).map(obj).map(o => {
    const title = str(o.title, 160);
    if (!title) return null;
    const url = str(o.url, 400);
    return {
      title, why: guard(str(o.why, 300), source),
      kind: (kinds as readonly string[]).includes(String(o.kind)) ? o.kind as LiFeatured["kind"] : "link",
      url: url && source.includes(url) ? url : null,
    };
  }).filter((x): x is LiFeatured => !!x).slice(0, 6);
  return { skills, featured };
}

export function normalizeActivityAnswer(raw: unknown, source: string) {
  const r = obj(raw);
  const recRequests: LiRecRequest[] = arr(r.recommendationRequests).map(obj).map(o => {
    const text = guard(str(o.text, 700), source);
    return text ? { to: str(o.to, 160) ?? "", text } : null;
  }).filter((x): x is LiRecRequest => !!x).slice(0, 4);
  const pillars: LiPillar[] = arr(r.pillars).map(obj).map(o => {
    const title = str(o.title, 120);
    return title ? { title, why: guard(str(o.why, 300), source), ideas: strList(o.ideas, 4, 300).map(i => guardNumbers(i, source)) } : null;
  }).filter((x): x is LiPillar => !!x).slice(0, 4);
  const g = obj(r.groups);
  const groups: LiGroups | null = (Array.isArray(g.criteria) || Array.isArray(g.searchTerms))
    ? { criteria: strList(g.criteria, 6, 200), searchTerms: strList(g.searchTerms, 10, 60) } : null;
  const plan: LiPlanWeek[] = arr(r.plan).map(obj).map((o, i) => ({ week: Math.max(1, Math.min(4, Math.round(Number(o.week) || i + 1))), tasks: strList(o.tasks, 5, 240) }))
    .filter(w => w.tasks.length).slice(0, 4);
  return { recRequests, pillars, groups, plan };
}

// ── draft composition ───────────────────────────────────────────
/** Domains a profile built from scratch has (empty = 0 points, which is honest for a new profile). */
const BUILD_PRESENT = ["PROFILE", "POSITIONS", "EDUCATION", "SKILLS", "RECOMMENDATIONS", "MEMBER_SHARE_INFO", "ALL_COMMENTS", "CONNECTIONS"];

/** First draft profile: a copy of the base (texts dropped when the base is in another language) or an empty new profile. */
export function initialDraftProfile(base: LinkedInProfile | null, opts: { sameLang: boolean; location?: string | null; now?: Date }): LinkedInProfile {
  const fetchedAt = (opts.now ?? new Date()).toISOString();
  if (base) {
    const p = structuredClone(base);
    if (!opts.sameLang) {
      p.basics.headline = null; p.basics.summary = null;
      p.positions = p.positions.map(x => ({ ...x, description: null }));
    }
    p.meta = { ...p.meta, source: "builder", fetchedAt, failed: [] };
    return p;
  }
  return linkedInProfileSchema.parse({
    basics: { location: opts.location ?? null },
    recommendations: { received: [], givenCount: 0 },
    network: { connections: 0, groups: [] },
    meta: { source: "builder", fetchedAt, notProvided: ["photo", "banner", "customUrl", "featured", "openTo"], failed: [], present: BUILD_PRESENT },
  });
}

/** Writes generated texts into the draft profile and marks the domains as delivered. */
export function applyDraftParts(p: LinkedInProfile, parts: {
  headline?: string | null; summary?: string | null; positions?: Positions; education?: Education | null; volunteering?: Volunteering | null; skills?: LiDraftSkill[];
}): LinkedInProfile {
  const out = structuredClone(p);
  const present = new Set(out.meta.present ?? []);
  if (parts.headline !== undefined) { out.basics.headline = parts.headline; present.add("PROFILE"); }
  if (parts.summary !== undefined) { out.basics.summary = parts.summary; present.add("PROFILE"); }
  if (parts.positions) { out.positions = parts.positions; present.add("POSITIONS"); }
  if (parts.education) { out.education = parts.education; present.add("EDUCATION"); }
  if (parts.volunteering) { out.volunteering = parts.volunteering; present.add("VOLUNTEERING_EXPERIENCES"); }
  if (parts.skills) {
    const ends = new Map(out.skills.map(s => [norm(s.name), s.endorsements ?? 0]));
    out.skills = parts.skills.map(s => ({ name: s.name, endorsements: ends.get(norm(s.name)) ?? 0 }));
    present.add("SKILLS");
  }
  // Legacy imports without `present` count everything as delivered — keep that.
  if (out.meta.present) out.meta.present = [...present];
  return out;
}

export function emptyDraftRaw(lang: LinkedInLang, base: { id: string; lang: string | null } | null, now = new Date()): LiDraftRaw {
  return {
    kind: "draft", lang, baseVersionId: base?.id ?? null, baseLang: base?.lang ?? null, positioning: null, applicationId: null,
    updatedAt: now.toISOString(), generated: {}, errors: {}, headlineVariants: [], skills: [], positionSkills: {},
    featured: [], recRequests: [], pillars: [], groups: null, plan: [], ndaHints: [], warnings: [],
  };
}

/** Number of [X] placeholders left in the draft texts (shown before copying). */
export function placeholderCount(p: LinkedInProfile): number {
  const t = [p.basics.headline, p.basics.summary,
    ...p.positions.flatMap(x => [x.title, x.company, x.description, x.start, x.end]),
    ...p.education.flatMap(x => [x.school, x.degree, x.notes, x.start, x.end]),
    ...p.volunteering.flatMap(x => [x.role, x.organization, x.description, x.start, x.end])].filter(Boolean).join("\n");
  return (t.match(/\[X\]/g) ?? []).length;
}

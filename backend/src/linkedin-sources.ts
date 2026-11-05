// ─── LinkedIn-Check: suggestions from the user's own documents ─────────────────────
// What the CV (CV-Check versions, else the Master-CV text) and the Documents library
// (certificates) hold, compared with the LinkedIn profile: skills, certifications and
// languages that could be added. No model involved — every suggestion is a verbatim
// term from a named source, so it can be offered with one click and needs no [X].
//
// Rules — don't "fix" them:
// - A term is a candidate only if it appears in a source; it keeps the source's wording.
// - Skills are compared with the profile only when the source delivered the SKILLS
//   domain (a LinkedIn PDF shows just the top 3) — otherwise `skillsKnown` is false and
//   the UI says "check whether it is on LinkedIn" instead of "missing".
// - Certificates from the CV and from Documents are merged when their names match;
//   issuer, date and credential ID are only read from the document summary, never guessed.

import type { CvDocument, LinkedInProfile } from "@application-pal/shared";

export type LiLangLevel = "native" | "fullProfessional" | "professionalWorking" | "limitedWorking" | "elementary";
export type LiSourceSkill = { name: string; group: string | null; source: string; inProfile: boolean; inDraft: boolean };
export type LiSourceCert = { name: string; issuer: string | null; date: string | null; credentialId: string | null; sources: string[]; inProfile: boolean };
export type LiSourceLang = { name: string; level: string | null; linkedinLevel: LiLangLevel | null; source: string; inProfile: boolean };
export type LiSourceSuggestions = {
  cvLang: string | null;
  /** True when the profile's skills are complete (ZIP/API); a PDF only shows the top skills. */
  skillsKnown: boolean;
  skills: LiSourceSkill[];
  certifications: LiSourceCert[];
  languages: LiSourceLang[];
  /** Keyword suggestions for "What are you especially good at?" — methods first, tools last. */
  keywords: string[];
};

// ── text helpers ────────────────────────────────────────────────
const norm = (s: string) => s.toLocaleLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss")
  .replace(/[‐‑‒–—]/g, "-").replace(/\s+/g, " ").trim();
const tokens = (s: string) => norm(s).replace(/[^a-z0-9+#]+/g, " ").split(" ").filter(Boolean);

function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** Same word, allowing one typo in longer words ("Planing" ~ "Planning"). */
const sameWord = (a: string, b: string) => a === b || (a.length >= 6 && b.length >= 6 && lev(a, b) <= 1);
/** Same skill: equal after normalising, or one typo. "Figma" ≠ "Figma FigJam proficiency" on purpose. */
const sameSkill = (a: string, b: string) => {
  const x = norm(a).replace(/[.\s]+$/, ""), y = norm(b).replace(/[.\s]+$/, "");
  return x === y || (x.length >= 6 && lev(x, y) <= 1);
};

// Certificate names: generic words and common abbreviations don't decide a match.
const CERT_STOP = new Set(["by", "for", "and", "of", "the", "in", "a", "an", "de", "des", "la", "le", "et", "und", "fur", "von", "im", "zu",
  "certificate", "certification", "certificat", "zertifikat", "course", "kurs", "cours", "professional", "pdf", "a4"]);
const CERT_ALIAS: Record<string, string[]> = { ux: ["user", "experience"], nng: ["nn", "group"], nngroup: ["nn", "group"], ui: ["user", "interface"] };
function certTokens(s: string): string[] {
  const out: string[] = [];
  for (const t of tokens(s.replace(/\//g, " "))) {
    if (CERT_STOP.has(t) || /^\d+$/.test(t)) continue;
    out.push(...(CERT_ALIAS[t] ?? [t]));
  }
  return [...new Set(out)];
}
/** Jaccard ≥ 0.7, or the shorter name (≥ 3 words) is fully contained in the longer one. */
export function sameCert(a: string, b: string): boolean {
  const x = certTokens(a), y = certTokens(b);
  if (!x.length || !y.length) return false;
  const hit = x.filter(t => y.some(u => sameWord(t, u))).length;
  const union = x.length + y.length - hit;
  return hit / union >= 0.7 || (Math.min(x.length, y.length) >= 3 && hit === Math.min(x.length, y.length));
}

// ── languages ───────────────────────────────────────────────────
const LANG_NAMES: string[][] = [
  ["deutsch", "german", "allemand"], ["englisch", "english", "anglais"], ["franzosisch", "french", "francais"],
  ["italienisch", "italian", "italien"], ["spanisch", "spanish", "espagnol"], ["portugiesisch", "portuguese", "portugais"],
  ["niederlandisch", "dutch", "neerlandais"], ["russisch", "russian", "russe"], ["chinesisch", "chinese", "chinois"],
  ["japanisch", "japanese", "japonais"], ["arabisch", "arabic", "arabe"], ["turkisch", "turkish", "turc"],
  ["polnisch", "polish", "polonais"], ["schweizerdeutsch", "swiss german", "suisse allemand"],
];
const langKey = (name: string) => { const n = norm(name); return LANG_NAMES.findIndex(g => g.includes(n)); };
const sameLanguage = (a: string, b: string) => { const x = langKey(a), y = langKey(b); return x >= 0 ? x === y : norm(a) === norm(b); };
/** CV wording → LinkedIn's five proficiency levels. */
export function linkedinLevel(level: string | null): LiLangLevel | null {
  const l = norm(level ?? "");
  if (!l) return null;
  if (/near[- ]native|nahezu mutter|quasi[- ]?(bilingue|maternelle)/.test(l)) return "fullProfessional";
  if (/mutter|native|maternelle|bilingu|erstsprache/.test(l)) return "native";
  if (/c2|c1|verhandlungssicher|fliessend|fluent|courant|near native|business|professionnel complet|full professional/.test(l)) return "fullProfessional";
  if (/b2|gut|good|professional working|bonne/.test(l)) return "professionalWorking";
  if (/b1|a2|grundkenntnisse|basic|limited|notions|intermediate|mittel/.test(l)) return "limitedWorking";
  if (/a1|elementar|elementary|debutant|anfanger/.test(l)) return "elementary";
  return null;
}

// ── CV parsing ──────────────────────────────────────────────────
const CERT_TITLE = /zertifik|certific|schulung|training|weiterbildung|formation|lizenz|licen[cs]e/i;
const LANG_TITLE = /sprach|language|langue/i;
/** "Barrierefreiheit (WCAG), CSS & HTML (Grundkenntnisse)" → Barrierefreiheit, WCAG, CSS, HTML. */
export function splitSkillTerms(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[,;•·|\n]+|\s\/\s|\s&\s/)) {
    const acronyms = [...part.matchAll(/\(([A-Z0-9][A-Z0-9 .+#/-]{1,9})\)/g)].map(m => m[1].trim());
    let term = part.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").replace(/^[\s\-–:]+|[\s.:–-]+$/g, "").trim();
    if (term.length >= 2 && term.length <= 50 && term.split(" ").length <= 5 && /[A-Za-zÀ-ÿ]/.test(term)) out.push(term);
    for (const a of acronyms) if (!a.includes("/")) out.push(a);
  }
  return out;
}
const itemText = (it: CvDocument["sections"][number]["items"][number]) =>
  [it.text, ...it.bullets.map(b => b.text)].filter(Boolean).join("\n");

type CvFacts = { skills: Array<{ name: string; group: string | null }>; certs: string[]; langs: Array<{ name: string; level: string | null }> };
export function cvFacts(doc: CvDocument): CvFacts {
  const f: CvFacts = { skills: [], certs: [], langs: [] };
  const lines = (s: string) => s.split(/\n+/).map(x => x.trim()).filter(Boolean);
  const addLang = (line: string) => {
    const m = line.match(/^([^(:–-]+?)\s*(?:[(:–-]\s*(.+?)\)?)?$/);
    if (m && m[1].trim().length <= 30) f.langs.push({ name: m[1].trim(), level: m[2]?.trim() || null });
  };
  for (const sec of doc.sections) {
    for (const it of sec.items) {
      const title = it.title?.trim() || null;
      const text = itemText(it);
      if (sec.kind === "certifications" || (sec.kind === "skills" && title && CERT_TITLE.test(title))) {
        if (sec.kind === "certifications" && title) f.certs.push([title, it.org && `(${it.org})`].filter(Boolean).join(" "));
        else f.certs.push(...lines(text));
      } else if (sec.kind === "languages" || (sec.kind === "skills" && title && LANG_TITLE.test(title))) {
        if (sec.kind === "languages" && title) addLang([title, it.text].filter(Boolean).join(" – "));
        else lines(text).forEach(addLang);
      } else if (sec.kind === "skills") {
        // "Methoden: Design Thinking, …" → title is the group; an item without text is itself the skill.
        if (text.trim()) for (const name of splitSkillTerms(text)) f.skills.push({ name, group: title });
        else if (title) for (const name of splitSkillTerms(title)) f.skills.push({ name, group: sec.title || null });
      }
    }
  }
  return f;
}
/** Master-CV text without structure: lines like "Tools: Figma, Miro" under a skills-like label. */
export function textCvFacts(text: string): CvFacts {
  const f: CvFacts = { skills: [], certs: [], langs: [] };
  for (const line of text.split(/\n/)) {
    const m = line.match(/^\s*[-*•]?\s*\**([^:*]{2,40}?)\**\s*:\s*(.+)$/);
    if (!m || !/skill|kenntnis|kompetenz|fahigkeit|fähigkeit|tool|method|software|competen|outil/i.test(m[1])) continue;
    for (const name of splitSkillTerms(m[2].replace(/^\*+\s*/, ""))) f.skills.push({ name, group: m[1].trim() });
  }
  return f;
}

// ── certificate documents ───────────────────────────────────────
const MONTHS: Record<string, number> = {
  jan: 1, janv: 1, feb: 2, fev: 2, fevr: 2, mar: 3, marz: 3, mars: 3, apr: 4, avr: 4, avri: 4, may: 5, mai: 5, jun: 6, juni: 6, juin: 6,
  jul: 7, juli: 7, juil: 7, aug: 8, aout: 8, sep: 9, sept: 9, oct: 10, okt: 10, nov: 11, dec: 12, dez: 12,
};
const monthOf = (w: string) => { const n = norm(w).replace(/\./g, ""); return MONTHS[n] ?? MONTHS[n.slice(0, 4)] ?? MONTHS[n.slice(0, 3)] ?? null; };
const ym = (y: string, m: number | null) => (m ? `${y}-${String(m).padStart(2, "0")}` : y);
/** First date in the text as "YYYY-MM" (or "YYYY"): "10. Juni 2026", "Nov. 23, 2025", "June 2026", "06/2026". */
export function firstDate(text: string): string | null {
  let m = text.match(/\b(\d{1,2})\.?\s+([A-Za-zÀ-ÿ]{3,10})\.?\s+((?:19|20)\d{2})\b/);
  if (m && monthOf(m[2])) return ym(m[3], monthOf(m[2]));
  m = text.match(/\b([A-Za-zÀ-ÿ]{3,10})\.?\s+(\d{1,2}),?\s+((?:19|20)\d{2})\b/);
  if (m && monthOf(m[1])) return ym(m[3], monthOf(m[1]));
  m = text.match(/\b([A-Za-zÀ-ÿ]{3,10})\.?\s+((?:19|20)\d{2})\b/);
  if (m && monthOf(m[1])) return ym(m[2], monthOf(m[1]));
  m = text.match(/\b(\d{1,2})[./]((?:19|20)\d{2})\b/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return ym(m[2], +m[1]);
  m = text.match(/\b((?:19|20)\d{2})\b/);
  return m ? m[1] : null;
}
/** "NNG-UX-Certificate-1067965-Medvesek_A4" → "NNG UX Certificate" (file names only; real titles stay). */
export function cleanDocName(name: string, ownName: string[] = []): string {
  if (/\s/.test(name.trim()) || !/[-_]/.test(name)) return name.replace(/\.pdf$/i, "").trim();
  const own = new Set(ownName.map(norm));
  return name.replace(/\.pdf$/i, "").split(/[-_]+/)
    .filter(t => t && !/^\d{4,}$/.test(t) && !/^a4$/i.test(t) && !own.has(norm(t))).join(" ").trim() || name;
}
export function certFromDoc(doc: { name: string; summary: string | null }, ownName: string[] = []) {
  const s = doc.summary ?? "";
  // Match on the label before ":" ("Time period/Certificate date: …"), not just its first word.
  const lineOf = (re: RegExp) => s.split(/\n/).find(l => l.includes(":") && re.test(l.slice(0, l.indexOf(":")))) ?? null;
  const issuerLine = lineOf(/aussteller|issuer|emetteur|émetteur|organisme/i);
  const issuer = issuerLine?.replace(/^[^:]*:\s*/, "").split(/[(,;]| – | - /)[0].trim() || null;
  const dateLine = lineOf(/zeitraum|datum|date|period|ausstellung|abschluss|issued|completed|délivr|deliv/i);
  const id = s.match(/(?:UXC#|credential\s*id|zertifikats?-?(?:nr|nummer)|certificate\s*(?:no|number|id)|license\s*(?:no|number))\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,})/i);
  return {
    name: cleanDocName(doc.name, ownName),
    issuer: issuer && issuer.length <= 60 ? issuer : null,
    date: firstDate(dateLine ?? "") ?? null,
    credentialId: id?.[1] ?? null,
  };
}

// ── main ────────────────────────────────────────────────────────
const TOOL_GROUP = /tool|software|programm|outil|platt?form/i;

export function liSourceSuggestions(o: {
  lang: string | null;
  imported: LinkedInProfile | null;
  draft: LinkedInProfile | null;
  cvs: Array<{ lang: string; doc: CvDocument }>;
  masterCv?: string | null;
  certDocs: Array<{ name: string; summary: string | null }>;
  ownName?: string[];
}): LiSourceSuggestions {
  const cv = o.cvs.find(c => c.lang === o.lang) ?? o.cvs[0] ?? null;
  const facts = cv ? cvFacts(cv.doc) : textCvFacts(o.masterCv ?? "");
  const cvLabel = cv ? `CV ${cv.lang.toUpperCase()}` : "Master-CV";
  const base = o.imported ?? o.draft;
  const skillsKnown = !!base && (!base.meta.present || base.meta.present.includes("SKILLS"));

  const skills: LiSourceSkill[] = [];
  for (const s of facts.skills) {
    if (skills.some(x => sameSkill(x.name, s.name))) continue;
    skills.push({
      name: s.name, group: s.group, source: s.group ? `${cvLabel} · ${s.group}` : cvLabel,
      inProfile: !!o.imported?.skills.some(p => sameSkill(p.name, s.name)),
      inDraft: !!o.draft?.skills.some(p => sameSkill(p.name, s.name)),
    });
  }

  const certifications: LiSourceCert[] = [];
  const addCert = (c: { name: string; issuer?: string | null; date?: string | null; credentialId?: string | null }, source: string) => {
    const hit = certifications.find(x => sameCert(x.name, c.name));
    if (hit) {
      // A document beats the CV line for the details (it is the certificate itself).
      hit.issuer ??= c.issuer ?? null; hit.date ??= c.date ?? null; hit.credentialId ??= c.credentialId ?? null;
      if (!hit.sources.includes(source)) hit.sources.push(source);
      return;
    }
    certifications.push({
      name: c.name, issuer: c.issuer ?? null, date: c.date ?? null, credentialId: c.credentialId ?? null, sources: [source],
      inProfile: !!base?.certifications.some(p => sameCert(p.name, c.name)),
    });
  };
  for (const d of o.certDocs) addCert(certFromDoc(d, o.ownName), `doc:${d.name}`);
  for (const line of facts.certs) addCert({ name: line }, cvLabel);

  const languages: LiSourceLang[] = [];
  for (const l of facts.langs) {
    if (languages.some(x => sameLanguage(x.name, l.name))) continue;
    languages.push({ name: l.name, level: l.level, linkedinLevel: linkedinLevel(l.level), source: cvLabel, inProfile: !!base?.languages.some(p => sameLanguage(p.name, l.name)) });
  }

  // Keywords: profile skills that the CV confirms, then methods/other CV terms, then the rest of
  // the profile skills, tools last (a tool is rarely what someone is "especially good at").
  const keywords: string[] = [];
  const push = (k: string) => { if (k && !keywords.some(x => sameSkill(x, k))) keywords.push(k); };
  const profSkills = (o.imported?.skills ?? []).map(s => s.name);
  profSkills.filter(p => skills.some(s => sameSkill(s.name, p))).forEach(push);
  skills.filter(s => !TOOL_GROUP.test(s.group ?? "")).forEach(s => push(s.name));
  profSkills.forEach(push);
  skills.filter(s => TOOL_GROUP.test(s.group ?? "")).forEach(s => push(s.name));

  return { cvLang: cv?.lang ?? null, skillsKnown, skills, certifications, languages, keywords: keywords.slice(0, 60) };
}

/** Compact, verbatim block for the generator prompt (before the long CV text, so it is never cut off). */
export function liSourceFactsText(s: LiSourceSuggestions): string {
  const out: string[] = [];
  if (s.skills.length) {
    const groups = new Map<string, string[]>();
    for (const k of s.skills) groups.set(k.group ?? "", [...(groups.get(k.group ?? "") ?? []), k.name]);
    out.push(`## Kenntnisse laut Lebenslauf (wörtlich)\n${[...groups].map(([g, xs]) => `- ${g ? `${g}: ` : ""}${xs.join(", ")}`).join("\n")}`);
  }
  if (s.certifications.length) {
    out.push(`## Zertifikate (Lebenslauf und Dokumente)\n${s.certifications.map(c => `- ${[c.name, c.issuer, c.date].filter(Boolean).join(" · ")}`).join("\n")}`);
  }
  if (s.languages.length) out.push(`## Sprachen laut Lebenslauf\n${s.languages.map(l => `- ${l.name}${l.level ? ` (${l.level})` : ""}`).join("\n")}`);
  return out.join("\n\n");
}

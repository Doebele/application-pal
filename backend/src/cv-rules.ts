// ─── CV-Check: checks + scoring (pure) ────────────────────────────────────────
// Turns a structured CV (+ optional Doc header text, PDF layout facts and LLM
// judgements) into a VMock-style result: 100 points = Impact 40 + Presentation 20
// + Competencies 40, +10 bonus when every hygiene check passes. Weights and word
// lists come from cv-criteria.ts. A check whose input is missing is "na" (not
// checkable) — it never counts as passed and is excluded from shares, so the
// score shows what was actually verified.

import type { CvDocument, CvItem, CvLanguage } from "@application-pal/shared";
import { CV_CRITERIA, checkDef, type CvCheckArea } from "./cv-criteria.js";
import { findLine, type LayoutFacts, type LayoutLine } from "./cv-layout.js";

export type UiLang = "de" | "en" | "fr";
type L10n = { de: string; en: string; fr: string };
const pick = (l: L10n, lang: UiLang) => l[lang] ?? l.en;

/** "accepted" = the user consciously waived this point (e.g. a deliberate design choice) — scores like "pass". */
export type CheckStatus = "pass" | "fail" | "na" | "accepted";
export type CheckFinding = { text: string; where?: string };
export type CheckOutcome = {
  id: string; area: CvCheckArea; group: string; hygiene: boolean; kind: string;
  label: string; rule: string; status: CheckStatus; score: number; max: number;
  findings: CheckFinding[];
};
export type BulletOutcome = {
  id: string; text: string; position: string;
  action: { ok: boolean; firstWord: string; source: "list" | "llm" | "none"; accepted: boolean };
  scope: boolean | null; outcome: boolean | null; specificsAccepted: boolean;
  issues: string[];
  suggestions: { scope?: string; outcome?: string };
};
export type CompetencyOutcome = { id: string; label: string; count: number; score: number; max: number; evidence: string[] };
export type AreaOutcome = { score: number; max: number; status: "good" | "onTrack" | "needsWork" };
export type ImproveStep = { id: string; label: string; gain: number; detail?: string };
export type Recommendation = { id: string; ok: boolean; text: string };
export type CvCheckResult = {
  criteriaVersion: string; checkedAt: string; cvLang: CvLanguage; uiLang: UiLang;
  total: number;
  /** Score without any accepted waivers, and the points the waivers add on top. */
  rawTotal: number; acceptedGain: number; accepted: string[];
  bonus: { earned: boolean; points: number; failingHygiene: string[]; unverifiedHygiene: string[] };
  areas: Record<CvCheckArea, AreaOutcome>;
  checks: CheckOutcome[]; bullets: BulletOutcome[]; competencies: CompetencyOutcome[];
  steps: ImproveStep[]; recommendations: Recommendation[];
  inputs: { layout: boolean; llm: boolean; header: boolean };
};

/** What the LLM judges (one call per check run, see CV_JUDGE_SYSTEM_PROMPT in index.ts). */
export type LlmJudgement = {
  bullets: Array<{ id: string; strongVerb?: boolean; scope?: boolean; outcome?: boolean; rewriteScope?: string; rewriteOutcome?: string }>;
  spelling: Array<{ text: string; suggestion?: string }>;
  competencies: Partial<Record<"leadership" | "initiative" | "analytical" | "communication" | "teamwork", string[]>>;
  headline?: { isBranding?: boolean; suggestion?: string };
};

export type CheckInput = {
  cv: CvDocument; cvLang: CvLanguage; uiLang: UiLang;
  headerText?: string | null;       // Google Doc header/footer text (contact details often live there)
  layout?: LayoutFacts | null;
  llm?: LlmJudgement | null;
  /** Waiver keys: a check id ("format.colour") or a per-bullet key ("action:<bulletId>", "specifics:<bulletId>"). */
  accepted?: string[];
  now?: Date;
};

// ── small helpers ────────────────────────────────────────────────
const words = (list: string) => new Set(list.split(/\s+/).filter(Boolean));
const round1 = (n: number) => Math.round(n * 10) / 10;
const lower = (s: string) => s.toLocaleLowerCase();
const firstWordOf = (s: string) => (s.trim().match(/^[\p{L}][\p{L}'’\-]*/u)?.[0] ?? s.trim().split(/\s+/)[0] ?? "");
const isCaps = (s: string) => { const l = s.replace(/[^\p{L}]/gu, ""); return l.length > 1 && l === l.toLocaleUpperCase(); };
const isTitleCase = (s: string) => s.split(/\s+/).filter(w => /^\p{L}/u.test(w) && w.length > 3).every(w => w[0] === w[0].toLocaleUpperCase());
const caseOf = (s: string) => (isCaps(s) ? "caps" : isTitleCase(s) ? "title" : "other");
const statusOf = (share: number): AreaOutcome["status"] =>
  share >= CV_CRITERIA.status.good ? "good" : share >= CV_CRITERIA.status.onTrack ? "onTrack" : "needsWork";

const PHONE_RE = /(?:\+|\b0)\d[\d\s\-/().]{6,}\d/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const digitsOf = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "").replace(/^41/, "");

const M = {
  startsWith: { de: "beginnt mit „{w}“", en: "starts with “{w}”", fr: "commence par « {w} »" },
  noNumber: { de: "keine Zahl für Umfang oder Ergebnis", en: "no number for scope or outcome", fr: "aucun chiffre pour la portée ou le résultat" },
  filler: { de: "Füllwort „{w}“", en: "filler “{w}”", fr: "mot creux « {w} »" },
  pronoun: { de: "beginnt mit Pronomen/Artikel „{w}“", en: "starts with pronoun/article “{w}”", fr: "commence par « {w} »" },
  firstPerson: { de: "Ich-Form in der Summary („{w}“)", en: "first person in the summary (“{w}”)", fr: "première personne dans le résumé (« {w} »)" },
  overuse: { de: "„{w}“ kommt {n}× als Startwort vor", en: "“{w}” opens {n} bullets", fr: "« {w} » ouvre {n} puces" },
  spelling: { de: "„{w}“{s}", en: "“{w}”{s}", fr: "« {w} »{s}" },
  pages: { de: "{n} Seiten", en: "{n} pages", fr: "{n} pages" },
  missingSection: { de: "fehlt: {w}", en: "missing: {w}", fr: "manquant : {w}" },
  noBullets: { de: "Berufserfahrung ohne Bullets", en: "experience without bullets", fr: "expérience sans puces" },
  colour: { de: "farbiger Text: „{w}“ ({c})", en: "coloured text: “{w}” ({c})", fr: "texte coloré : « {w} » ({c})" },
  notBold: { de: "nicht fett: „{w}“", en: "not bold: “{w}”", fr: "pas en gras : « {w} »" },
  italic: { de: "kursiv: „{w}“", en: "italic: “{w}”", fr: "en italique : « {w} »" },
  dateFormats: { de: "uneinheitliche Datumsformate: {w}", en: "mixed date formats: {w}", fr: "formats de date mixtes : {w}" },
  dateOrder: { de: "nicht umgekehrt chronologisch: „{w}“", en: "not reverse chronological: “{w}”", fr: "pas antichronologique : « {w} »" },
  dashes: { de: "uneinheitliche Striche/Leerzeichen in Daten", en: "inconsistent dashes/spaces in dates", fr: "tirets/espaces incohérents dans les dates" },
  germanDate: { de: "„heute“ statt „Present“", en: "“heute” instead of “Present”", fr: "« heute » au lieu de « Present »" },
  headingSizes: { de: "Grössen: {w}", en: "sizes: {w}", fr: "tailles : {w}" },
  margin: { de: "Seite {p}: {side} {v} cm", en: "page {p}: {side} {v} in", fr: "page {p} : {side} {v} cm" },
  fill: { de: "Seite {p} nur zu {v} % gefüllt", en: "page {p} only {v}% full", fr: "page {p} remplie à {v} %" },
  caseMix: { de: "Gross-/Kleinschreibung gemischt: {w}", en: "mixed casing: {w}", fr: "casse mixte : {w}" },
  align: { de: "unterschiedlich ausgerichtet", en: "aligned differently", fr: "alignement différent" },
  spacing: { de: "Abstände variieren um bis zu {v} pt", en: "spacing varies by up to {v} pt", fr: "l'espacement varie jusqu'à {v} pt" },
  periodMix: { de: "„{w}“: {a} mit, {b} ohne Schlusspunkt", en: "“{w}”: {a} with, {b} without full stop", fr: "« {w} » : {a} avec, {b} sans point" },
  images: { de: "{n} Bild(er)/Logo(s)", en: "{n} image(s)/logo(s)", fr: "{n} image(s)/logo(s)" },
  fills: { de: "{n} farbige Fläche(n) / Hervorhebung(en)", en: "{n} coloured area(s) / highlight(s)", fr: "{n} zone(s) colorée(s)" },
  nameSize: { de: "Name {a} pt, grösster Text {b} pt („{w}“)", en: "name {a} pt, largest text {b} pt (“{w}”)", fr: "nom {a} pt, plus grand texte {b} pt (« {w} »)" },
  count: { de: "{n} gefunden: {w}", en: "{n} found: {w}", fr: "{n} trouvé(s) : {w}" },
  inconsistent: { de: "uneinheitlich: {a} fett, {b} nicht fett", en: "inconsistent: {a} bold, {b} not bold", fr: "incohérent : {a} en gras, {b} non" },
  noLayout: { de: "kein PDF zur Layoutprüfung", en: "no PDF for layout check", fr: "pas de PDF pour le contrôle de mise en page" },
  noLlm: { de: "keine KI-Bewertung", en: "no AI judgement", fr: "pas d'évaluation IA" },
  notFound: { de: "im PDF nicht gefunden", en: "not found in the PDF", fr: "introuvable dans le PDF" },
} satisfies Record<string, L10n>;
const fmt = (l: L10n, lang: UiLang, vars: Record<string, string | number> = {}) =>
  pick(l, lang).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

const SECTION_NAMES: Record<string, L10n> = {
  summary: { de: "Summary/Profil", en: "Summary", fr: "Résumé" },
  experience: { de: "Berufserfahrung", en: "Experience", fr: "Expérience" },
  education: { de: "Ausbildung", en: "Education", fr: "Formation" },
  skills: { de: "Skills", en: "Skills", fr: "Compétences" },
};

// ── main ─────────────────────────────────────────────────────────
export function runCvCheck(input: CheckInput): CvCheckResult {
  const accepted = [...new Set(input.accepted ?? [])];
  const result = scoreCv({ ...input, accepted });
  if (!accepted.length) return result;
  const raw = scoreCv({ ...input, accepted: [] });
  return { ...result, rawTotal: raw.total, acceptedGain: result.total - raw.total };
}

function scoreCv(input: CheckInput): CvCheckResult {
  const { cv, cvLang, uiLang, layout, llm } = input;
  const W = CV_CRITERIA.weights;
  const acc = new Set(input.accepted ?? []);
  const checks: CheckOutcome[] = [];
  const add = (id: string, status: CheckStatus, score: number, max: number, findings: CheckFinding[] = []) => {
    const d = checkDef(id);
    // A waived failing check counts as passed with full points; findings stay visible.
    if (status === "fail" && acc.has(id)) { status = "accepted"; score = max; }
    checks.push({ id, area: d.area, group: d.group, hygiene: d.hygiene, kind: d.kind, label: pick(d.label, uiLang), rule: pick(d.rule, uiLang), status, score: round1(score), max, findings });
  };
  const waive = (id: string, st: CheckStatus): CheckStatus => (st === "fail" && acc.has(id) ? "accepted" : st);
  const na = (why: L10n) => [{ text: pick(why, uiLang) }];

  const experience = cv.sections.filter(s => s.kind === "experience");
  const education = cv.sections.filter(s => s.kind === "education");
  const expItems = experience.flatMap(s => s.items);
  const bulletsRaw = expItems.flatMap(it => it.bullets.map(b => ({ ...b, item: it })));
  const strong = words(CV_CRITERIA.strongVerbs[cvLang]);
  const weak = words(CV_CRITERIA.weakOpeners[cvLang]);
  const pronouns = new Set(CV_CRITERIA.pronounsArticles[cvLang]);
  const llmBullet = new Map((llm?.bullets ?? []).map(b => [b.id, b]));
  const position = (it: CvItem) => [it.title, it.org].filter(Boolean).join(" · ");

  // ── Impact: per bullet ──
  const openers = new Map<string, number>();
  const bullets: BulletOutcome[] = bulletsRaw.map(b => {
    const fw = firstWordOf(b.text);
    const fwl = lower(fw);
    const j = llmBullet.get(b.id);
    let ok: boolean; let source: BulletOutcome["action"]["source"];
    if (strong.has(fwl)) { ok = true; source = "list"; }
    else if (weak.has(fwl) || pronouns.has(fwl)) { ok = false; source = "list"; }
    else if (j?.strongVerb !== undefined) { ok = !!j.strongVerb; source = "llm"; }
    else { ok = false; source = "none"; }
    const actionAccepted = !ok && acc.has(`action:${b.id}`);
    if (actionAccepted) ok = true;
    openers.set(fwl, (openers.get(fwl) ?? 0) + 1);
    const hasNumber = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|dozen|hundreds?|thousands?|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|deux|trois|quatre|cinq|dix)\b/i.test(b.text);
    // VMock counts a bullet as specific only when it is quantified: the LLM decides scope vs
    // outcome, but without any number in the text neither counts (calibrated on a real CV).
    const scope = hasNumber && (j?.scope ?? !llm);
    const outcome = hasNumber && (j?.outcome ?? (!llm && /%|\bprozent|\bpercent|chf|eur|usd|\$|€/i.test(b.text)));
    const specificsAccepted = !scope && !outcome && acc.has(`specifics:${b.id}`);
    const issues: string[] = [];
    if (!ok) issues.push(fmt(M.startsWith, uiLang, { w: fw }));
    if (!scope && !outcome && !specificsAccepted) issues.push(pick(M.noNumber, uiLang));
    return {
      id: b.id, text: b.text, position: position(b.item),
      action: { ok, firstWord: fw, source, accepted: actionAccepted }, scope, outcome, specificsAccepted, issues,
      suggestions: { scope: j?.rewriteScope || undefined, outcome: j?.rewriteOutcome || undefined },
    };
  });
  const nB = bullets.length;
  if (nB) {
    const actionOk = bullets.filter(b => b.action.ok).length;
    add("action", actionOk === nB ? "pass" : "fail", (W.impact.action * actionOk) / nB, W.impact.action,
      bullets.filter(b => !b.action.ok).map(b => ({ text: fmt(M.startsWith, uiLang, { w: b.action.firstWord }), where: b.text })));
    const specOk = bullets.filter(b => b.scope || b.outcome || b.specificsAccepted).length;
    add("specifics", specOk === nB ? "pass" : "fail", (W.impact.specifics * specOk) / nB, W.impact.specifics,
      bullets.filter(b => !b.scope && !b.outcome && !b.specificsAccepted).map(b => ({ text: pick(M.noNumber, uiLang), where: b.text })));
  } else {
    add("action", "fail", 0, W.impact.action, [{ text: pick(M.noBullets, uiLang) }]);
    add("specifics", "fail", 0, W.impact.specifics, [{ text: pick(M.noBullets, uiLang) }]);
  }

  // ── Impact: language ──
  const summary = cv.basics.summary ?? cv.sections.find(s => s.kind === "summary")?.items[0]?.text ?? "";
  const proseTexts = [summary, ...bulletsRaw.map(b => b.text)].filter(Boolean);
  const fillerHits: CheckFinding[] = [];
  for (const t of proseTexts) for (const f of CV_CRITERIA.fillers[cvLang]) {
    const re = new RegExp(`(^|[^\\p{L}])${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}])`, "iu");
    if (re.test(t)) fillerHits.push({ text: fmt(M.filler, uiLang, { w: f }), where: t.slice(0, 90) });
  }
  add("language.fillers", fillerHits.length ? "fail" : "pass", 0, 0, fillerHits);

  const pronounHits: CheckFinding[] = bulletsRaw
    .filter(b => pronouns.has(lower(firstWordOf(b.text))))
    .map(b => ({ text: fmt(M.pronoun, uiLang, { w: firstWordOf(b.text) }), where: b.text }));
  const fp = new Set(CV_CRITERIA.firstPerson[cvLang]);
  const fpWord = summary.split(/[^\p{L}'’]+/u).find(w => fp.has(lower(w)));
  if (fpWord) pronounHits.push({ text: fmt(M.firstPerson, uiLang, { w: fpWord }) });
  add("language.pronouns", pronounHits.length ? "fail" : "pass", 0, 0, pronounHits);

  const overuse: CheckFinding[] = [...openers].filter(([w, n]) => n > 1 && w.length > 2 && !pronouns.has(w))
    .map(([w, n]) => ({ text: fmt(M.overuse, uiLang, { w, n }) }));
  const overusePenaltyCount = [...openers].filter(([w, n]) => n > 1 && w.length > 2 && !pronouns.has(w)).reduce((s, [, n]) => s + n - 1, 0);
  add("language.overuse", overuse.length ? "fail" : "pass", 0, 0, overuse);

  if (llm) {
    const sp = llm.spelling.map(s => ({ text: fmt(M.spelling, uiLang, { w: s.text, s: s.suggestion ? ` → ${s.suggestion}` : "" }) }));
    add("language.spelling", sp.length ? "fail" : "pass", 0, 0, sp);
  } else add("language.spelling", "na", 0, 0, na(M.noLlm));

  const unlessAccepted = (id: string, n: number) => (acc.has(id) ? 0 : n);
  const langFindings = unlessAccepted("language.fillers", fillerHits.length) + unlessAccepted("language.pronouns", pronounHits.length)
    + unlessAccepted("language.overuse", overusePenaltyCount) + unlessAccepted("language.spelling", llm?.spelling.length ?? 0);
  const languageScore = Math.max(0, W.impact.language - CV_CRITERIA.languagePenalty * langFindings);
  // Language points are carried by a synthetic group total (the four language checks have max 0)
  const languageMax = W.impact.language;

  // ── Presentation: pages ──
  if (layout) {
    const p = layout.pages;
    const s = p <= CV_CRITERIA.pages.fullPages ? W.presentation.pages : p === CV_CRITERIA.pages.halfPages ? W.presentation.pages / 2 : 0;
    add("pages", p <= CV_CRITERIA.pages.fullPages ? "pass" : "fail", s, W.presentation.pages, p > CV_CRITERIA.pages.fullPages ? [{ text: fmt(M.pages, uiLang, { n: p }) }] : []);
  } else add("pages", "na", 0, W.presentation.pages, na(M.noLayout));

  // ── Presentation: essential sections ──
  {
    const missing: string[] = [];
    if (!summary) missing.push(pick(SECTION_NAMES.summary, uiLang));
    if (!experience.length) missing.push(pick(SECTION_NAMES.experience, uiLang));
    if (!education.length) missing.push(pick(SECTION_NAMES.education, uiLang));
    if (!cv.sections.some(s => s.kind === "skills")) missing.push(pick(SECTION_NAMES.skills, uiLang));
    const f: CheckFinding[] = missing.map(w => ({ text: fmt(M.missingSection, uiLang, { w }) }));
    if (experience.length && !nB) f.push({ text: pick(M.noBullets, uiLang) });
    add("sections", f.length ? "fail" : "pass", f.length ? 0 : W.presentation.sections, W.presentation.sections, f);
  }

  // ── Presentation: overall format (9) + section specific (7) ──
  const fmtResults: Array<[string, CheckStatus, CheckFinding[]]> = [];
  const secResults: Array<[string, CheckStatus, CheckFinding[]]> = [];
  const L = layout;
  const headingLines = L ? cv.sections.map(s => findLine(L, s.title)).filter((l): l is LayoutLine => !!l) : [];

  // colour
  if (L) {
    const bad = L.colouredText.filter(r => !r.isLink);
    fmtResults.push(["format.colour", bad.length ? "fail" : "pass", bad.slice(0, 6).map(r => ({ text: fmt(M.colour, uiLang, { w: r.text.slice(0, 50), c: r.color }) }))]);
  } else fmtResults.push(["format.colour", "na", na(M.noLayout)]);

  // dates — structure part always, bold/italic part only with layout
  {
    const dated = [...expItems, ...education.flatMap(s => s.items)].filter(it => it.dateText);
    const f: CheckFinding[] = [];
    const shapes = new Set(dated.map(it => it.dateText!.replace(/\d/g, "9").replace(/\p{L}+/gu, "A").replace(/\s+/g, " ")));
    if (shapes.size > 1) f.push({ text: fmt(M.dateFormats, uiLang, { w: [...new Set(dated.map(it => it.dateText))].slice(0, 4).join(" / ") }) });
    const dashStyles = new Set(dated.map(it => (it.dateText!.match(/\s?[-–—]\s?/)?.[0] ?? "")).filter(Boolean));
    if (dashStyles.size > 1) f.push({ text: pick(M.dashes, uiLang) });
    if (cvLang !== "de" && dated.some(it => /\bheute\b|\bbis heute\b/i.test(it.dateText!))) f.push({ text: pick(M.germanDate, uiLang) });
    const starts = expItems.map(it => it.start).filter((s): s is string => !!s);
    for (let i = 1; i < starts.length; i++) if (starts[i] > starts[i - 1]) { f.push({ text: fmt(M.dateOrder, uiLang, { w: expItems[i].dateText ?? starts[i] }) }); break; }
    if (L) {
      for (const it of dated) {
        const line = findLine(L, it.dateText);
        if (!line) continue;
        if (line.italic) f.push({ text: fmt(M.italic, uiLang, { w: it.dateText! }) });
        else if (!line.bold) f.push({ text: fmt(M.notBold, uiLang, { w: it.dateText! }) });
      }
    }
    fmtResults.push(["format.dates", f.length ? "fail" : (L ? "pass" : "na"), f.length ? f.slice(0, 8) : L ? [] : na(M.noLayout)]);
  }

  // heading sizes / style / spacing
  if (L && headingLines.length >= 2) {
    const sizes = [...new Set(headingLines.map(l => l.size))];
    fmtResults.push(["format.headingSize", Math.max(...sizes) - Math.min(...sizes) > 0.5 ? "fail" : "pass",
      sizes.length > 1 ? [{ text: fmt(M.headingSizes, uiLang, { w: headingLines.map(l => `${l.text.slice(0, 24)} ${l.size}`).join(", ") }) }] : []]);
    const st: CheckFinding[] = [];
    headingLines.filter(l => !l.bold).forEach(l => st.push({ text: fmt(M.notBold, uiLang, { w: l.text.slice(0, 40) }) }));
    headingLines.filter(l => l.italic).forEach(l => st.push({ text: fmt(M.italic, uiLang, { w: l.text.slice(0, 40) }) }));
    const cases = new Set(headingLines.map(l => caseOf(l.text)));
    if (cases.size > 1) st.push({ text: fmt(M.caseMix, uiLang, { w: headingLines.map(l => l.text.slice(0, 20)).join(", ") }) });
    const xs = headingLines.map(l => l.x);
    if (Math.max(...xs) - Math.min(...xs) > 6) st.push({ text: pick(M.align, uiLang) });
    fmtResults.push(["format.headingStyle", st.length ? "fail" : "pass", st.slice(0, 8)]);
    const gaps: number[] = [];
    for (const h of headingLines) {
      const same = L.lines.filter(l => l.page === h.page).sort((a, b) => b.y - a.y);
      const i = same.indexOf(h);
      if (i > 0) gaps.push(same[i - 1].y - h.y);
      if (i >= 0 && i < same.length - 1) gaps.push(h.y - same[i + 1].y);
    }
    const before = gaps.filter((_, i) => i % 2 === 0), spread = gaps.length > 2 ? Math.max(...gaps) - Math.min(...gaps) : 0;
    void before;
    fmtResults.push(["format.headingSpacing", spread > 6 ? "fail" : "pass", spread > 6 ? [{ text: fmt(M.spacing, uiLang, { v: Math.round(spread) }) }] : []]);
  } else {
    const why = L ? na(M.notFound) : na(M.noLayout);
    fmtResults.push(["format.headingSize", "na", why], ["format.headingStyle", "na", why], ["format.headingSpacing", "na", why]);
  }

  // margins + length
  if (L) {
    const { min, max, tolerance } = CV_CRITERIA.marginsPt;
    const unit = uiLang === "en" ? 72 : 72 / 2.54;
    const f: CheckFinding[] = [];
    L.pageInfo.forEach((p, i) => {
      if (!p.margins) return;
      for (const [side, v] of Object.entries(p.margins)) {
        if (side === "bottom" && i === L.pageInfo.length - 1) continue; // last page may end early
        if (v < min - tolerance || v > max + tolerance) f.push({ text: fmt(M.margin, uiLang, { p: i + 1, side, v: (v / unit).toFixed(1) }) });
      }
    });
    fmtResults.push(["format.margins", f.length ? "fail" : "pass", f.slice(0, 8)]);
    const lf = L.pageInfo.map((p, i) => [i + 1, p.fill ?? 0] as const).filter(([, fl]) => fl < CV_CRITERIA.minPageFill)
      .map(([p, fl]) => ({ text: fmt(M.fill, uiLang, { p, v: Math.round(fl * 100) }) }));
    fmtResults.push(["format.length", lf.length ? "fail" : "pass", lf]);
  } else fmtResults.push(["format.margins", "na", na(M.noLayout)], ["format.length", "na", na(M.noLayout)]);

  // bullet punctuation (structure only)
  {
    const f: CheckFinding[] = [];
    for (const s of cv.sections) {
      const bs = s.items.flatMap(it => it.bullets);
      if (bs.length < 2) continue;
      const withDot = bs.filter(b => /[.!]$/.test(b.text.trim())).length;
      if (withDot && withDot < bs.length) f.push({ text: fmt(M.periodMix, uiLang, { w: s.title, a: withDot, b: bs.length - withDot }) });
    }
    fmtResults.push(["format.bullets", f.length ? "fail" : "pass", f]);
  }

  // images / highlights
  if (L) {
    const f: CheckFinding[] = [];
    if (L.images) f.push({ text: fmt(M.images, uiLang, { n: L.images }) });
    if (L.colouredFills) f.push({ text: fmt(M.fills, uiLang, { n: L.colouredFills }) });
    fmtResults.push(["format.images", f.length ? "fail" : "pass", f]);
  } else fmtResults.push(["format.images", "na", na(M.noLayout)]);

  // name + name size
  if (L && cv.basics.name) {
    const nl = findLine(L, cv.basics.name);
    if (!nl) { secResults.push(["section.name", "na", na(M.notFound)], ["section.nameSize", "na", na(M.notFound)]); }
    else {
      const f: CheckFinding[] = [];
      if (!nl.bold) f.push({ text: fmt(M.notBold, uiLang, { w: cv.basics.name }) });
      if (nl.italic) f.push({ text: fmt(M.italic, uiLang, { w: cv.basics.name }) });
      if (caseOf(cv.basics.name) === "other") f.push({ text: fmt(M.caseMix, uiLang, { w: cv.basics.name }) });
      secResults.push(["section.name", f.length ? "fail" : "pass", f]);
      const bigger = L.lines.filter(l => l !== nl && l.size >= nl.size).sort((a, b) => b.size - a.size)[0];
      secResults.push(["section.nameSize", bigger ? "fail" : "pass", bigger ? [{ text: fmt(M.nameSize, uiLang, { a: nl.size, b: bigger.size, w: bigger.text.slice(0, 30) }) }] : []]);
    }
  } else secResults.push(["section.name", "na", na(M.noLayout)], ["section.nameSize", "na", na(M.noLayout)]);

  // phone / email — body + header + other details
  {
    const pool = [cv.basics.phones.join(" "), cv.basics.emails.join(" "), cv.basics.otherDetails.join(" "), input.headerText ?? ""].join("\n");
    const phones = [...new Set((pool.match(PHONE_RE) ?? []).map(digitsOf).filter(d => d.length >= 8))];
    const emails = [...new Set((pool.match(EMAIL_RE) ?? []).map(e => e.toLowerCase()))];
    secResults.push(["section.phone", phones.length === 1 ? "pass" : "fail", phones.length === 1 ? [] : [{ text: fmt(M.count, uiLang, { n: phones.length, w: (pool.match(PHONE_RE) ?? []).map(s => s.trim()).filter((v, i, a) => a.indexOf(v) === i).join(", ") }) }]]);
    secResults.push(["section.email", emails.length === 1 ? "pass" : "fail", emails.length === 1 ? [] : [{ text: fmt(M.count, uiLang, { n: emails.length, w: emails.join(", ") }) }]]);
  }

  // degree / university / job title styling
  const styling = (id: string, texts: Array<string | null | undefined>) => {
    if (!L) { secResults.push([id, "na", na(M.noLayout)]); return; }
    const found = texts.filter((t): t is string => !!t).map(t => ({ t, l: findLine(L, t) })).filter(x => x.l) as Array<{ t: string; l: LayoutLine }>;
    if (!found.length) { secResults.push([id, "na", na(M.notFound)]); return; }
    const f: CheckFinding[] = [];
    const bold = found.filter(x => x.l.bold).length;
    if (bold && bold < found.length) f.push({ text: fmt(M.inconsistent, uiLang, { a: bold, b: found.length - bold }) });
    found.filter(x => x.l.italic).slice(0, 4).forEach(x => f.push({ text: fmt(M.italic, uiLang, { w: x.t.slice(0, 40) }) }));
    if (new Set(found.map(x => caseOf(x.t))).size > 1) f.push({ text: fmt(M.caseMix, uiLang, { w: found.slice(0, 3).map(x => x.t.slice(0, 20)).join(", ") }) });
    secResults.push([id, f.length ? "fail" : "pass", f]);
  };
  const eduItems = education.flatMap(s => s.items);
  styling("section.degree", eduItems.map(it => it.title));
  styling("section.university", eduItems.map(it => it.org));
  styling("section.jobTitle", expItems.map(it => it.title));

  for (const rs of [fmtResults, secResults]) rs.forEach(r => { r[1] = waive(r[0], r[1]); });
  const share = (rs: Array<[string, CheckStatus, CheckFinding[]]>) => {
    const checkable = rs.filter(r => r[1] !== "na");
    return checkable.length ? checkable.filter(r => r[1] === "pass" || r[1] === "accepted").length / checkable.length : 0;
  };
  const fmtShare = share(fmtResults), secShare = share(secResults);
  fmtResults.forEach(([id, st, f]) => add(id, st, 0, 0, f));
  secResults.forEach(([id, st, f]) => add(id, st, 0, 0, f));
  const formatScore = W.presentation.format * fmtShare;
  const sectionScore = W.presentation.section * secShare;

  // ── Competencies ──
  const COMP = ["leadership", "initiative", "analytical", "communication", "teamwork"] as const;
  const competencies: CompetencyOutcome[] = COMP.map(k => {
    const ev = llm?.competencies?.[k] ?? [];
    const count = ev.length;
    const max = W.competencies.perCompetency;
    const score = !llm ? 0 : count >= CV_CRITERIA.competencyEvidence.strong ? max : count >= 1 ? max / 2 : 0;
    add(`competency.${k}`, !llm ? "na" : count >= CV_CRITERIA.competencyEvidence.strong ? "pass" : "fail", score, max,
      !llm ? na(M.noLlm) : ev.slice(0, 4).map(q => ({ text: q })));
    return { id: k, label: pick(checkDef(`competency.${k}`).label, uiLang), count, score, max, evidence: ev };
  });

  // ── Areas, bonus, total ──
  const sumGroup = (area: CvCheckArea, group: string) => checks.filter(c => c.area === area && c.group === group).reduce((s, c) => s + c.score, 0);
  const impact = sumGroup("impact", "action") + sumGroup("impact", "specifics") + languageScore;
  const presentation = sumGroup("presentation", "pages") + sumGroup("presentation", "sections") + formatScore + sectionScore;
  const competency = competencies.reduce((s, c) => s + c.score, 0);
  const hyg = checks.filter(c => c.hygiene);
  const failingHygiene = hyg.filter(c => c.status === "fail").map(c => c.label);
  const unverifiedHygiene = hyg.filter(c => c.status === "na").map(c => c.label);
  const bonusEarned = !failingHygiene.length && !unverifiedHygiene.length;
  const total = Math.min(W.max, impact + presentation + competency + (bonusEarned ? W.bonus : 0));
  const area = (score: number, max: number): AreaOutcome => ({ score: round1(score), max, status: statusOf(score / max) });
  const impactMax = W.impact.action + W.impact.specifics + languageMax;
  const presMax = W.presentation.pages + W.presentation.sections + W.presentation.format + W.presentation.section;
  const compMax = W.competencies.perCompetency * COMP.length;

  // ── Steps to improve ──
  const S: Record<string, L10n> = {
    action: { de: "Bullets mit starkem Aktionsverb beginnen", en: "Start bullets with strong action verbs", fr: "Commencer les puces par un verbe d'action" },
    specifics: { de: "Bullets quantifizieren (Umfang und Ergebnis)", en: "Quantify bullets (scope and outcome)", fr: "Chiffrer les puces (portée et résultat)" },
    language: { de: "Sprache bereinigen (Füllwörter, Wiederholungen, Rechtschreibung)", en: "Clean up language (fillers, repetition, spelling)", fr: "Nettoyer la langue (mots creux, répétitions, orthographe)" },
    pages: { de: "Auf höchstens 2 Seiten kürzen", en: "Trim to at most 2 pages", fr: "Réduire à 2 pages maximum" },
    sections: { de: "Pflichtabschnitte ergänzen", en: "Add the essential sections", fr: "Ajouter les sections essentielles" },
    layout: { de: "Layout korrigieren (Format und Abschnitte)", en: "Fix the layout (format and sections)", fr: "Corriger la mise en page" },
    bonus: { de: "Alle Pflichtprüfungen bestehen (Bonus)", en: "Pass all hygiene checks (bonus)", fr: "Réussir tous les contrôles obligatoires (bonus)" },
    competencies: { de: "Kompetenzen mit Belegen sichtbar machen", en: "Show competencies with evidence", fr: "Rendre les compétences visibles avec des preuves" },
  };
  const stepsRaw: Array<[string, number, string?]> = [
    ["action", W.impact.action - sumGroup("impact", "action")],
    ["specifics", W.impact.specifics - sumGroup("impact", "specifics")],
    ["language", languageMax - languageScore],
    ["pages", W.presentation.pages - sumGroup("presentation", "pages")],
    ["sections", W.presentation.sections - sumGroup("presentation", "sections")],
    ["layout", W.presentation.format + W.presentation.section - formatScore - sectionScore],
    ["bonus", bonusEarned ? 0 : W.bonus, [...failingHygiene, ...unverifiedHygiene].join(", ")],
    ["competencies", compMax - competency],
  ];
  const steps: ImproveStep[] = stepsRaw.filter(([, g]) => g >= 0.5).map(([id, g, d]) => ({ id, label: pick(S[id], uiLang), gain: Math.round(g), detail: d }))
    .sort((a, b) => b.gain - a.gain);

  // ── Recommendations (not scored) ──
  const R = {
    linkedin: { de: "Individuelle LinkedIn-URL (linkedin.com/in/…) angeben", en: "Add a custom LinkedIn URL (linkedin.com/in/…)", fr: "Indiquer une URL LinkedIn personnalisée" },
    location: { de: "Ort im Format „Stadt, PLZ“ (ohne Strasse)", en: "Location as “City, postal code” (no street)", fr: "Lieu au format « Ville, NPA » (sans rue)" },
    headline: { de: "Branding Headline (Zielrolle + Expertise) statt „Profil“", en: "Branding headline (target role + expertise) instead of “Profile”", fr: "Titre de positionnement au lieu de « Profil »" },
  };
  const allText = [cv.basics.linkedin, cv.basics.website, ...cv.basics.otherDetails, input.headerText].join(" ");
  const genericTitle = /^(profil|profile|summary|zusammenfassung|über mich|about me|résumé|profil professionnel)$/i;
  const summaryTitle = cv.sections.find(s => s.kind === "summary")?.title ?? "";
  const headlineOk = llm?.headline?.isBranding ?? (!!cv.basics.headline && !genericTitle.test(cv.basics.headline.trim()));
  const recommendations: Recommendation[] = [
    { id: "linkedin", ok: /linkedin\.com\/in\/[\w-]+/i.test(allText), text: pick(R.linkedin, uiLang) },
    { id: "location", ok: !!cv.basics.location && !/strasse|straße|str\.|street|rue|weg\b/i.test([cv.basics.location, ...cv.basics.otherDetails, input.headerText ?? ""].join(" ")), text: pick(R.location, uiLang) },
    { id: "headline", ok: headlineOk && !genericTitle.test(summaryTitle.trim()), text: pick(R.headline, uiLang) + (llm?.headline?.suggestion ? ` — z. B. „${llm.headline.suggestion}“` : "") },
  ];

  return {
    criteriaVersion: CV_CRITERIA.version, checkedAt: (input.now ?? new Date()).toISOString(), cvLang, uiLang,
    total: Math.round(total),
    rawTotal: Math.round(total), acceptedGain: 0, accepted: [...acc],
    bonus: { earned: bonusEarned, points: W.bonus, failingHygiene, unverifiedHygiene },
    areas: { impact: area(impact, impactMax), presentation: area(presentation, presMax), competencies: area(competency, compMax) },
    checks, bullets, competencies, steps, recommendations,
    inputs: { layout: !!layout, llm: !!llm, header: !!input.headerText },
  };
}

// ── LLM judgement: prompt + normalisation ─────────────────────────
// The LLM only judges what code can't: verb strength for unknown openers, whether a
// bullet carries scope/outcome, two rewrites, spelling, competency evidence (verbatim
// quotes) and the branding headline. Rewrites never invent numbers — [X] placeholders.
const CV_LANG_NAME: Record<CvLanguage, string> = { de: "Deutsch", en: "English", fr: "Français" };

export function cvJudgePrompt(cvLang: CvLanguage): string {
  return `Du bewertest einen Lebenslauf nach den Kriterien von VMock. Antworte NUR mit JSON, ohne Erklärtext.
Alle Texte, die du schreibst (Rewrites, Korrekturen, Headline), in der Sprache des Lebenslaufs: ${CV_LANG_NAME[cvLang]}.

Pro Bullet (Feld "id" unverändert übernehmen):
- "strongVerb": true, wenn das erste Wort ein starkes Aktionsverb ist (z. B. led, built, increased / leitete, entwickelte). Substantive, Adjektive, Partizipien als Einstieg ("Responsible for", "Experience in", "Serving") = false.
- "scope": true, wenn der Bullet den Umfang beziffert oder konkret benennt (Teamgrösse, Budget, Anzahl Nutzer/Projekte/Märkte, Zeitraum).
- "outcome": true, wenn der Bullet ein messbares Ergebnis nennt (%, Umsatz, Zeitersparnis, Conversion, Rang).
- "rewriteScope": der Bullet umgeschrieben mit starkem Aktionsverb vorne und Umfang. "rewriteOutcome": umgeschrieben mit starkem Aktionsverb und Ergebnis.
  ERFINDE NIEMALS Zahlen, Firmen oder Fakten. Fehlt eine Zahl, setze den Platzhalter [X] (z. B. "um [X] %"). Max. 2 Zeilen, keine Floskeln, kein "I"/"ich".
  Ist der Bullet schon gut (strongVerb, scope und outcome true), lass beide Rewrites weg.

"spelling": echte Rechtschreib- und Grammatikfehler, je { "text": "falsches Wort/Fragment", "suggestion": "Korrektur" }. Eigennamen, Fachbegriffe und Anglizismen sind KEINE Fehler. Keine Stilfragen.

"competencies": für leadership, initiative, analytical, communication, teamwork je eine Liste WÖRTLICHER Zitate (max. 12 Wörter, exakt aus dem CV kopiert), die diese Kompetenz belegen. Nur klare Belege, max. 4 je Kompetenz; keine Belege = leere Liste.

"headline": { "isBranding": true, wenn oben eine Positionierungs-Headline steht (Zielrolle + Expertise, z. B. "Senior Product Designer | Digital Platforms & AI"), false bei fehlender oder generischer ("Profil", "Lebenslauf"); "suggestion": ein Vorschlag (max. 10 Wörter), nur aus Fakten des CVs }.

Format:
{"bullets":[{"id":"…","strongVerb":true,"scope":false,"outcome":false,"rewriteScope":"…","rewriteOutcome":"…"}],
 "spelling":[{"text":"…","suggestion":"…"}],
 "competencies":{"leadership":["…"],"initiative":[],"analytical":[],"communication":[],"teamwork":[]},
 "headline":{"isBranding":false,"suggestion":"…"}}`;
}

export function cvJudgeInput(cv: CvDocument): string {
  const lines: string[] = [];
  const b = cv.basics;
  lines.push(`Name: ${b.name ?? ""}`, `Headline: ${b.headline ?? "(keine)"}`);
  if (b.summary) lines.push(`Summary: ${b.summary}`);
  for (const s of cv.sections) {
    lines.push(`\n## ${s.title} (${s.kind})`);
    for (const it of s.items) {
      const head = [it.title, it.org, it.dateText].filter(Boolean).join(" | ");
      if (head) lines.push(`### ${head}`);
      if (it.text) lines.push(it.text);
      for (const bl of it.bullets) lines.push(`- [${bl.id}] ${bl.text}`);
    }
  }
  return `Lebenslauf (Bullets mit [id]):\n\n${lines.join("\n").slice(0, 30000)}`;
}

/** Defensive parse of the model's JSON — unknown ids dropped, quotes kept only if they occur in the CV. */
export function normalizeJudgement(raw: unknown, cv: CvDocument): LlmJudgement {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ids = new Set(cv.sections.flatMap(s => s.items.flatMap(i => i.bullets.map(b => b.id))));
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
  const bullets = (Array.isArray(o.bullets) ? o.bullets : []).flatMap((x: any) =>
    x && ids.has(String(x.id)) ? [{ id: String(x.id), strongVerb: bool(x.strongVerb), scope: bool(x.scope), outcome: bool(x.outcome), rewriteScope: str(x.rewriteScope), rewriteOutcome: str(x.rewriteOutcome) }] : []);
  const spelling = (Array.isArray(o.spelling) ? o.spelling : []).flatMap((x: any) => (str(x?.text) ? [{ text: str(x.text)!, suggestion: str(x.suggestion) }] : []))
    .filter(s => s.suggestion?.toLowerCase() !== s.text.toLowerCase()).slice(0, 30);
  const flat = lower(JSON.stringify(cv)).replace(/\s+/g, " ");
  const comps = (o.competencies && typeof o.competencies === "object" ? o.competencies : {}) as Record<string, unknown>;
  const competencies: LlmJudgement["competencies"] = {};
  for (const k of ["leadership", "initiative", "analytical", "communication", "teamwork"] as const) {
    const qs = (Array.isArray(comps[k]) ? comps[k] as unknown[] : []).map(str).filter((q): q is string => !!q);
    // Only quotes the CV really contains count as evidence (first 30 chars, case-insensitive)
    competencies[k] = [...new Set(qs.filter(q => flat.includes(lower(q).replace(/\s+/g, " ").replace(/^["„“]|["“”]$/g, "").slice(0, 30))))].slice(0, 4);
  }
  const h = (o.headline && typeof o.headline === "object" ? o.headline : {}) as Record<string, unknown>;
  return { bullets, spelling, competencies, headline: { isBranding: bool(h.isBranding), suggestion: str(h.suggestion) } };
}

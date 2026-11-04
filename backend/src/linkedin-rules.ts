// ─── LinkedIn-Check: checks + scoring (pure) ──────────────────────────────────
// Turns a LinkedInProfile (+ the user's goal, self-report and later LLM judgements)
// into a result in the same shape as the CV-Check, so the shared check components
// render it. Weights and word lists come from linkedin-criteria.ts.
//
// Rules — don't "fix" them:
// - A checkpoint without input is "na": it leaves the maximum, and the total is scaled
//   up from what was rated: total = round(earned / ratedMax × 100). Never guessed.
// - A section the source delivered but that is empty scores 0 (it is not "na").
// - Self-report covers what no import delivers (photo, banner, Featured, "Open to" …).
// - The 8 AI-visibility points are shown separately and never enter the total.

import type { LinkedInProfile } from "@application-pal/shared";
import { LI_CRITERIA, liCheckDef, liGroupDef, type LiArea, type LiEffort } from "./linkedin-criteria.js";

export type UiLang = "de" | "en" | "fr";
type L10n = { de: string; en: string; fr: string };
const pick = (l: L10n, lang: UiLang) => l[lang] ?? l.en;
const fmt = (l: L10n, lang: UiLang, vars: Record<string, string | number> = {}) =>
  pick(l, lang).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

export type CheckStatus = "pass" | "fail" | "na" | "accepted";
export type CheckFinding = { text: string; where?: string };
export type LiCheckOutcome = {
  id: string; area: LiArea | "ai"; group: string; hygiene: false; kind: string;
  label: string; rule: string; status: CheckStatus; score: number; max: number; findings: CheckFinding[];
};
export type LiAreaOutcome = { score: number; max: number; fullMax: number; status: "good" | "onTrack" | "needsWork" };
export type LiStep = { id: string; label: string; gain: number; effort: LiEffort; detail?: string };
export type LiRecommendation = { id: string; ok: boolean; text: string };
export type LiNotRated = { id: string; label: string; kind: string; max: number; why: string };
export type LiCheckResult = {
  criteriaVersion: string; checkedAt: string; uiLang: UiLang;
  /** 0–100, extrapolated from the rated points. */
  total: number; rawTotal: number; acceptedGain: number; accepted: string[];
  /** Earned points and the maximum that was actually rated (≤ 100). */
  rated: { score: number; max: number };
  areas: Record<LiArea, LiAreaOutcome>;
  ai: { score: number; max: number; fullMax: number; checks: LiCheckOutcome[] };
  checks: LiCheckOutcome[]; steps: LiStep[]; recommendations: LiRecommendation[]; notRated: LiNotRated[];
  inputs: { source: string; llm: boolean; selfReported: number; targetRole: boolean; missingDomains: string[] };
};

/** What the user tells us about the profile and their goal (stored in user_profile.linkedin_state). */
export type LiGoal = { kind?: "job" | "clients" | "switch" | "visibility"; targetRole?: string; market?: string };
/** Points per self-report check id (0 … max). */
export type LiSelfReport = Record<string, number>;
/** LLM judgements per check id. */
export type LiLlmJudgement = Record<string, { score: number; findings?: string[] }>;
/** CV vs LinkedIn comparison from the judge run (null = no CV available). */
export type LiCvFacts = { titleConflicts: Array<{ linkedin: string; cv: string }>; missingInLinkedIn: string[] };

export type LiCheckInput = {
  profile: LinkedInProfile; uiLang: UiLang;
  goal?: LiGoal | null; selfReport?: LiSelfReport | null; llm?: LiLlmJudgement | null; cvFacts?: LiCvFacts | null;
  /** Waivers: check ids the user accepts as they are. */
  accepted?: string[];
  now?: Date;
};

// ── messages ─────────────────────────────────────────────────────
const M = {
  noInput: { de: "Kein Inhalt vorhanden", en: "No content", fr: "Aucun contenu" },
  notDelivered: { de: "Die Quelle liefert diesen Teil nicht", en: "The source does not deliver this part", fr: "La source ne fournit pas cette partie" },
  selfMissing: { de: "Selbstauskunft fehlt", en: "Self-report missing", fr: "Auto-évaluation manquante" },
  llmMissing: { de: "KI-Bewertung noch nicht gelaufen", en: "AI judgement not run yet", fr: "Évaluation IA pas encore lancée" },
  noTarget: { de: "Zielrolle im Ziel angeben", en: "Set a target role in your goal", fr: "Indiquer un rôle cible" },
  noHeadline: { de: "Keine Headline", en: "No headline", fr: "Pas de titre" },
  noSummary: { de: "Kein Info-Text", en: "No About text", fr: "Pas de texte Infos" },
  phrase: { de: "Floskel „{w}“", en: "Buzzword “{w}”", fr: "Formule creuse « {w} »" },
  yearsOpener: { de: "Beginnt mit „über X Jahre Erfahrung“", en: "Opens with “over X years of experience”", fr: "Commence par « plus de X ans d'expérience »" },
  parts: { de: "{n} Teile mit Trennzeichen (höchstens {m})", en: "{n} separated parts (at most {m})", fr: "{n} segments (max. {m})" },
  titleAtCompany: { de: "Nur „Jobtitel bei Firma“", en: "Only “Title at Company”", fr: "Seulement « Poste chez Entreprise »" },
  roleLate: { de: "Zielrolle erst nach Zeichen {n}", en: "Target role only after character {n}", fr: "Rôle cible après le caractère {n}" },
  roleMissing: { de: "Zielrolle „{w}“ fehlt in der Headline", en: "Target role “{w}” missing from the headline", fr: "Rôle cible « {w} » absent du titre" },
  urlDefault: { de: "Standard-URL mit Zahlenanhang: {w}", en: "Default URL with number suffix: {w}", fr: "URL par défaut avec suffixe : {w}" },
  noUrl: { de: "Profil-URL unbekannt (im Profil eintragen)", en: "Profile URL unknown (add it to your profile)", fr: "URL du profil inconnue" },
  noLocation: { de: "Kein Standort", en: "No location", fr: "Pas de lieu" },
  noWebsite: { de: "Keine Website in den Kontaktinfos", en: "No website in contact info", fr: "Pas de site dans les coordonnées" },
  length: { de: "{n} Zeichen (Ziel {a}–{b})", en: "{n} characters (target {a}–{b})", fr: "{n} caractères (cible {a}–{b})" },
  paragraphs: { de: "{n} Absätze (mindestens {m})", en: "{n} paragraphs (at least {m})", fr: "{n} paragraphes (min. {m})" },
  noCta: { de: "Kein Kontakt- oder Gesprächsangebot am Ende", en: "No contact or conversation offer at the end", fr: "Pas d'appel au contact à la fin" },
  noPositions: { de: "Keine Berufserfahrung", en: "No experience", fr: "Aucune expérience" },
  noDescription: { de: "Ohne Beschreibung", en: "No description", fr: "Sans description" },
  fewResults: { de: "{n} Ergebnis-Sätze (Ziel 3–5)", en: "{n} result sentences (target 3–5)", fr: "{n} phrases de résultat (cible 3–5)" },
  numbers: { de: "{n} Aussagen mit Zahl", en: "{n} statements with a number", fr: "{n} énoncés chiffrés" },
  titleMismatch: { de: "Positionstitel „{t}“ passt nicht zur Headline", en: "Job title “{t}” doesn't match the headline", fr: "L'intitulé « {t} » ne correspond pas au titre" },
  cvConflict: { de: "LinkedIn „{a}“, im CV „{b}“", en: "LinkedIn “{a}”, CV “{b}”", fr: "LinkedIn « {a} », CV « {b} »" },
  gap: { de: "Lücke von {n} Monaten ({a} bis {b})", en: "Gap of {n} months ({a} to {b})", fr: "Trou de {n} mois ({a} à {b})" },
  olderLong: { de: "Ältere Station mit {n} Zeichen", en: "Older role with {n} characters", fr: "Ancien poste de {n} caractères" },
  noDates: { de: "Keine lesbaren Daten", en: "No readable dates", fr: "Aucune date lisible" },
  count: { de: "{n} vorhanden", en: "{n} present", fr: "{n} présent(s)" },
  noLink: { de: "Ohne Link", en: "No link", fr: "Sans lien" },
  noDegree: { de: "Ohne Abschluss oder Schule", en: "No degree or school", fr: "Sans diplôme ou école" },
  noRecentCert: { de: "Kein Zertifikat aus den letzten {n} Jahren", en: "No certification from the last {n} years", fr: "Aucune certification des {n} dernières années" },
  topEndorsed: { de: "„{w}“: {n} Bestätigungen", en: "“{w}”: {n} endorsements", fr: "« {w} » : {n} validations" },
  recent: { de: "{n} aus den letzten {y} Jahren", en: "{n} from the last {y} years", fr: "{n} des {y} dernières années" },
  companies: { de: "{n} verschiedene Firmen", en: "{n} different companies", fr: "{n} entreprises différentes" },
  noConcrete: { de: "Keine Empfehlung mit konkretem Inhalt (≥ {n} Zeichen)", en: "No recommendation with concrete content (≥ {n} characters)", fr: "Aucune recommandation détaillée" },
  noLevel: { de: "Sprachen ohne Niveau", en: "Languages without level", fr: "Langues sans niveau" },
  inDays: { de: "{n} in den letzten {d} Tagen", en: "{n} in the last {d} days", fr: "{n} sur les {d} derniers jours" },
  linksOnly: { de: "{a} von {b} Beiträgen nur geteilte Links", en: "{a} of {b} posts are shared links only", fr: "{a} sur {b} publications sont des liens" },
  connections: { de: "{n} Kontakte", en: "{n} connections", fr: "{n} relations" },
  groups: { de: "{n} Gruppen", en: "{n} groups", fr: "{n} groupes" },
  entityMissing: { de: "Fehlt: {w}", en: "Missing: {w}", fr: "Manquant : {w}" },
  nameNotInUrl: { de: "Name nicht in der URL", en: "Name not in the URL", fr: "Nom absent de l'URL" },
  lastActivity: { de: "Letzte Aktivität: {w}", en: "Last activity: {w}", fr: "Dernière activité : {w}" },
} satisfies Record<string, L10n>;

const STEP: Record<string, L10n> = {
  photo: { de: "Profilbild erneuern", en: "Update the profile photo", fr: "Mettre à jour la photo" },
  banner: { de: "Eigenes Banner gestalten", en: "Design your own banner", fr: "Créer une bannière" },
  headline: { de: "Headline schärfen", en: "Sharpen the headline", fr: "Affiner le titre" },
  basics: { de: "URL, Standort und Kontaktinfo vervollständigen", en: "Complete URL, location and contact info", fr: "Compléter URL, lieu et coordonnées" },
  about: { de: "Info-Text überarbeiten", en: "Rework the About text", fr: "Retravailler le texte Infos" },
  experience: { de: "Positionen mit Ergebnissen beschreiben", en: "Describe positions with results", fr: "Décrire les postes avec des résultats" },
  featured: { de: "„Im Fokus“ mit Belegen füllen", en: "Fill “Featured” with proof", fr: "Remplir la « Sélection » avec des preuves" },
  extras: { de: "Projekte, Ausbildung und Zertifikate ergänzen", en: "Add projects, education and certifications", fr: "Compléter projets, formation et certifications" },
  skills: { de: "Kenntnisse ausbauen und priorisieren", en: "Expand and prioritise skills", fr: "Étoffer et prioriser les compétences" },
  recommendations: { de: "Empfehlungen einholen", en: "Ask for recommendations", fr: "Demander des recommandations" },
  honors: { de: "Auszeichnungen, Publikationen und Sprachen eintragen", en: "Add honors, publications and languages", fr: "Ajouter distinctions, publications et langues" },
  posts: { de: "Regelmässig eigene Beiträge veröffentlichen", en: "Post your own content regularly", fr: "Publier régulièrement" },
  comments: { de: "Substanziell kommentieren", en: "Comment with substance", fr: "Commenter avec substance" },
  network: { de: "Netzwerk und Gruppen gezielt ausbauen", en: "Grow network and groups deliberately", fr: "Développer réseau et groupes" },
};

const REC: Record<string, L10n> = {
  goal: { de: "Zielrolle angeben, damit Headline und Suchbegriffe geprüft werden", en: "Set a target role so headline and search terms can be checked", fr: "Indiquer un rôle cible pour vérifier titre et mots-clés" },
  self: { de: "Selbstauskunft ergänzen (Bild, Banner, Im Fokus …): {n} Punkte sind noch nicht bewertet", en: "Complete the self-report (photo, banner, Featured …): {n} points are not rated yet", fr: "Compléter l'auto-évaluation : {n} points non évalués" },
  llm: { de: "KI-Bewertung starten: {n} Punkte (Headline, Info, Themen) brauchen das lokale Modell", en: "Run the AI judgement: {n} points (headline, About, topics) need the local model", fr: "Lancer l'évaluation IA : {n} points nécessitent le modèle local" },
  domains: { de: "Diese Teile fehlen in der Quelle: {w}", en: "These parts are missing from the source: {w}", fr: "Parties absentes de la source : {w}" },
  secondLang: { de: "Profil ist auf {a} – für den Zielmarkt ein Zweitprofil auf {b} anlegen (LinkedIn: „Profil in anderer Sprache hinzufügen“)", en: "Profile is in {a} — add a secondary profile in {b} for the target market (LinkedIn: “Add profile in another language”)", fr: "Profil en {a} — ajouter un profil secondaire en {b} pour le marché cible" },
  cvMissing: { de: "Im CV, aber nicht auf LinkedIn: {w}", en: "In the CV but not on LinkedIn: {w}", fr: "Dans le CV mais pas sur LinkedIn : {w}" },
};
const LANG_LABEL: Record<string, L10n> = {
  de: { de: "Deutsch", en: "German", fr: "allemand" },
  en: { de: "Englisch", en: "English", fr: "anglais" },
  fr: { de: "Französisch", en: "French", fr: "français" },
};

/** Rough language of a profile text by function words (de/en/fr), null when too short. */
export function detectTextLang(text: string): "de" | "en" | "fr" | null {
  const w = norm(text).split(/[^\p{L}]+/u);
  if (w.length < 12) return null;
  const count = (list: string[]) => w.filter(x => list.includes(x)).length;
  const s = {
    de: count(["und", "der", "die", "das", "ich", "mit", "fur", "ist", "nicht", "eine", "auf", "von", "zu", "bei"]),
    en: count(["and", "the", "with", "for", "is", "my", "of", "to", "in", "at", "who", "that", "on"]),
    fr: count(["et", "le", "la", "les", "des", "pour", "avec", "est", "je", "une", "dans", "du", "sur"]),
  };
  const best = (Object.entries(s) as Array<["de" | "en" | "fr", number]>).sort((a, b) => b[1] - a[1])[0];
  return best[1] >= 2 ? best[0] : null;
}
/** Language a target market expects, from free text ("Schweiz", "Zürich", "DACH", "Romandie" …). */
export function marketLang(market: string | null | undefined): "de" | "en" | "fr" | null {
  const m = norm(market ?? "");
  if (!m) return null;
  if (/romandie|geneve|genf|lausanne|neuchatel|fribourg|france|frankreich|paris|belgique|\bfr\b/.test(m)) return "fr";
  if (/dach|schweiz|suisse|switzerland|zurich|bern|basel|luzern|st\.? ?gallen|deutschland|germany|osterreich|austria|wien|munchen|berlin|hamburg|\b(ch|de|at)\b/.test(m)) return "de";
  if (/\b(uk|us|usa)\b|london|united|international|remote|global|english/.test(m)) return "en";
  return null;
}

// ── small helpers ────────────────────────────────────────────────
const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const norm = (s: string) => s.toLocaleLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
const STOP = new Set(["and", "und", "et", "the", "der", "die", "das", "des", "for", "fur", "pour", "with", "mit", "avec", "bei", "chez", "von", "of", "at", "in", "im", "en", "de", "du", "la", "le", "les", "a", "an", "ein", "eine", "senior", "junior", "lead"]);
const tokens = (s: string) => norm(s).split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 3 && !STOP.has(w));
const statusOf = (share: number): LiAreaOutcome["status"] =>
  share >= LI_CRITERIA.status.good ? "good" : share >= LI_CRITERIA.status.onTrack ? "onTrack" : "needsWork";

const MONTHS: Record<string, number> = {
  jan: 0, janv: 0, januar: 0, january: 0, janvier: 0, feb: 1, febr: 1, fev: 1, fevr: 1, februar: 1, february: 1, fevrier: 1,
  mar: 2, mrz: 2, marz: 2, maerz: 2, mars: 2, march: 2, apr: 3, avr: 3, april: 3, avril: 3, may: 4, mai: 4,
  jun: 5, juin: 5, juni: 5, june: 5, jul: 6, juil: 6, juli: 6, july: 6, juillet: 6, aug: 7, aout: 7, august: 7,
  sep: 8, sept: 8, september: 8, septembre: 8, oct: 9, okt: 9, oktober: 9, october: 9, octobre: 9,
  nov: 10, november: 10, novembre: 10, dec: 11, dez: 11, dezember: 11, december: 11, decembre: 11,
};
const ONGOING = /^(present|heute|aujourd'?hui|current|now|jetzt|actuel)/i;

/** Parses the date formats LinkedIn sources deliver. Returns null when unreadable. */
export function parseLiDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);                      // 2021-03, 2024-05-12 10:22:33
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 1));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);                            // 05/12/24 (ZIP: MM/DD/YY)
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return new Date(Date.UTC(y, +m[1] - 1, +m[2])); }
  m = s.match(/^(\d{1,2})[/.](\d{4})$/);                                      // 03/2021, 03.2021
  if (m) return new Date(Date.UTC(+m[2], +m[1] - 1, 1));
  m = s.match(/^([\p{L}.]+)\s+(\d{4})$/u);                                    // Mar 2021, März 2021, févr. 2021
  if (m) { const mo = MONTHS[norm(m[1]).replace(/\./g, "")]; if (mo !== undefined) return new Date(Date.UTC(+m[2], mo, 1)); }
  m = s.match(/^(\d{4})$/);                                                    // 2021
  if (m) return new Date(Date.UTC(+m[1], 0, 1));
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}
const monthsBetween = (a: Date, b: Date) => (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
const ym = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

/** Result statements in a position text: bullet lines, otherwise sentences of some length. */
export function resultStatements(text: string | null | undefined): string[] {
  const t = (text ?? "").trim();
  if (!t) return [];
  const lines = t.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const bullets = lines.filter(l => /^[-•*–·▪◦✓✔→>]\s*/.test(l)).map(l => l.replace(/^[-•*–·▪◦✓✔→>]\s*/, ""));
  if (bullets.length) return bullets.filter(b => b.length >= 15);
  return t.split(/(?<=[.!?])\s+|\r?\n+/).map(x => x.trim()).filter(x => x.length >= 25);
}
const hasNumber = (s: string) => /\d/.test(s);

function phrasesIn(text: string, lang: "de" | "en" | "fr" | "all"): string[] {
  const n = norm(text);
  const lists = lang === "all" ? [...LI_CRITERIA.phrases.de, ...LI_CRITERIA.phrases.en, ...LI_CRITERIA.phrases.fr] : LI_CRITERIA.phrases[lang];
  const found = new Set<string>();
  for (const p of lists) {
    const re = new RegExp(`(^|[^\\p{L}])${norm(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "u");
    if (re.test(n)) found.add(p);
  }
  return [...found];
}

// ── main ─────────────────────────────────────────────────────────
export function runLinkedInCheck(input: LiCheckInput): LiCheckResult {
  const accepted = [...new Set(input.accepted ?? [])];
  const result = scoreProfile({ ...input, accepted });
  if (!accepted.length) return result;
  const raw = scoreProfile({ ...input, accepted: [] });
  return { ...result, rawTotal: raw.total, acceptedGain: result.total - raw.total };
}

function scoreProfile(input: LiCheckInput): LiCheckResult {
  const { profile: p, uiLang } = input;
  const C = LI_CRITERIA;
  const now = input.now ?? new Date();
  const acc = new Set(input.accepted ?? []);
  const self = input.selfReport ?? {};
  const llm = input.llm ?? null;
  const targetRole = (input.goal?.targetRole ?? "").trim();
  const present = p.meta.present ? new Set(p.meta.present) : null;
  const failed = new Set(p.meta.failed ?? []);
  const has = (domain: string) => !failed.has(domain) && (!present || present.has(domain));
  const L = (l: L10n, vars?: Record<string, string | number>) => fmt(l, uiLang, vars);

  const out: LiCheckOutcome[] = [];
  const set = (id: string, status: CheckStatus, score: number, findings: CheckFinding[] = []) => {
    const d = liCheckDef(id);
    const g = liGroupDef(d.group);
    if (status === "fail" && acc.has(id)) { status = "accepted"; score = d.max; }
    if (status === "na") score = 0;
    out.push({ id, area: g.area, group: d.group, hygiene: false, kind: d.kind, label: pick(d.label, uiLang), rule: pick(d.rule, uiLang), status, score: round1(score), max: d.max, findings });
  };
  /** Graded rule check: full points = pass, anything less = fail. */
  const graded = (id: string, score: number, findings: CheckFinding[] = []) => {
    const max = liCheckDef(id).max;
    set(id, score >= max ? "pass" : "fail", clamp(score, 0, max), findings);
  };
  const na = (id: string, why: L10n) => set(id, "na", 0, [{ text: pick(why, uiLang) }]);
  const selfCheck = (id: string) => {
    const v = self[id];
    if (typeof v !== "number" || Number.isNaN(v)) return na(id, M.selfMissing);
    graded(id, v);
  };
  const llmCheck = (id: string, emptyAs0 = false, emptyWhy: L10n = M.noInput) => {
    if (emptyAs0) return graded(id, 0, [{ text: pick(emptyWhy, uiLang) }]);
    const j = llm?.[id];
    if (!j || typeof j.score !== "number") return na(id, M.llmMissing);
    graded(id, j.score, (j.findings ?? []).map(text => ({ text })));
  };

  const headline = (p.basics.headline ?? "").trim();
  const summary = (p.basics.summary ?? "").trim();
  const profileDelivered = has("PROFILE");

  // ── A First impression ──
  selfCheck("photo");
  selfCheck("banner");

  if (!profileDelivered) {
    for (const id of ["headline.role", "headline.niche", "headline.proof", "headline.keywords", "headline.clean"]) na(id, M.notDelivered);
  } else if (!headline) {
    for (const id of ["headline.role", "headline.niche", "headline.proof", "headline.keywords", "headline.clean"]) graded(id, 0, [{ text: L(M.noHeadline) }]);
  } else {
    const roleTokens = tokens(targetRole);
    if (roleTokens.length) {
      const pos = roleTokens.map(t => norm(headline).indexOf(t)).filter(i => i >= 0);
      const first = pos.length ? Math.min(...pos) : -1;
      if (first < 0) graded("headline.role", 0, [{ text: L(M.roleMissing, { w: targetRole }) }]);
      else if (first <= C.headlineMobileChars) graded("headline.role", 2);
      else graded("headline.role", 1, [{ text: L(M.roleLate, { n: first }) }]);
      const hit = roleTokens.filter(t => norm(headline).includes(t)).length / roleTokens.length;
      graded("headline.keywords", hit >= 0.99 ? 2 : hit >= 0.5 ? 1 : 0, hit >= 0.99 ? [] : [{ text: L(M.roleMissing, { w: targetRole }) }]);
    } else {
      llmCheck("headline.role");
      na("headline.keywords", M.noTarget);
    }
    llmCheck("headline.niche");
    llmCheck("headline.proof");
    const issues: CheckFinding[] = [];
    const ph = phrasesIn(headline, "all");
    ph.forEach(w => issues.push({ text: L(M.phrase, { w }) }));
    const parts = headline.split(/\s*[|•·▪/]\s*|\s+[–—-]\s+/).filter(Boolean).length;
    if (parts > C.headlineMaxParts) issues.push({ text: L(M.parts, { n: parts, m: C.headlineMaxParts }) });
    if (parts === 1 && /^[^|•·,]{2,60}\s(bei|at|chez|@)\s[^|•·,]{2,60}$/i.test(headline)) issues.push({ text: L(M.titleAtCompany) });
    const kinds = (ph.length ? 1 : 0) + (parts > C.headlineMaxParts ? 1 : 0) + (issues.some(i => i.text === L(M.titleAtCompany)) ? 1 : 0);
    graded("headline.clean", kinds === 0 ? 2 : kinds === 1 ? 1 : 0, issues);
  }

  // basics
  const url = (p.basics.publicUrl ?? "").trim();
  const slug = url.match(/linkedin\.com\/in\/([^/?#\s]+)/i)?.[1] ?? null;
  if (!slug) na("basics.url", M.noUrl);
  else {
    const last = slug.split("-").pop() ?? "";
    const isDefault = slug.split("-").length > 1 && /\d/.test(last) && last.length >= 4;
    graded("basics.url", isDefault ? 0 : 1, isDefault ? [{ text: L(M.urlDefault, { w: slug }) }] : []);
  }
  if (!profileDelivered) { na("basics.location", M.notDelivered); na("basics.website", M.notDelivered); }
  else {
    graded("basics.location", p.basics.location ? 1 : 0, p.basics.location ? [] : [{ text: L(M.noLocation) }]);
    graded("basics.website", p.basics.websites.length ? 1 : 0, p.basics.websites.length ? [] : [{ text: L(M.noWebsite) }]);
  }
  selfCheck("basics.introLink");
  selfCheck("basics.openTo");

  // ── B Content ──
  if (!profileDelivered) for (const id of ["about.hook", "about.proof", "about.positioning", "about.structure", "about.cta", "about.phrases"]) na(id, M.notDelivered);
  else if (!summary) {
    for (const id of ["about.hook", "about.proof", "about.positioning", "about.structure", "about.cta"]) graded(id, 0, [{ text: L(M.noSummary) }]);
    set("about.phrases", "pass", 0);
  } else {
    llmCheck("about.hook"); llmCheck("about.proof"); llmCheck("about.positioning");
    const len = summary.length;
    const paras = summary.split(/\n\s*\n|\n/).map(x => x.trim()).filter(x => x.length > 0).length;
    const lenOk = len >= C.about.minChars && len <= C.about.maxChars;
    const parOk = paras >= C.about.minParagraphs;
    graded("about.structure", (lenOk ? 1 : 0) + (parOk ? 1 : 0), [
      ...(lenOk ? [] : [{ text: L(M.length, { n: len, a: C.about.minChars, b: C.about.maxChars }) }]),
      ...(parOk ? [] : [{ text: L(M.paragraphs, { n: paras, m: C.about.minParagraphs }) }]),
    ]);
    const ctaOk = C.ctaHints.test(summary.slice(-300));
    graded("about.cta", ctaOk ? 2 : 0, ctaOk ? [] : [{ text: L(M.noCta) }]);
    // Buzzword deduction: −0.5 each, never more than the About points already earned.
    const ph = phrasesIn(summary, "all");
    const findings = ph.map(w => ({ text: L(M.phrase, { w }) }));
    if (C.yearsOpener.test(summary)) findings.push({ text: L(M.yearsOpener) });
    const earned = out.filter(o => o.group === "about" && o.id !== "about.phrases").reduce((s, o) => s + o.score, 0);
    const penalty = Math.min(findings.length * C.about.phrasePenalty, earned);
    if (!findings.length) set("about.phrases", "pass", 0);
    else if (acc.has("about.phrases")) set("about.phrases", "accepted", 0, findings);
    else set("about.phrases", "fail", -penalty, findings);
  }

  // experience
  type Pos = LinkedInProfile["positions"][number] & { s: Date | null; e: Date | null; ongoing: boolean };
  // A year-only end ("2016") means "some time in 2016" → count it as December, not as a gap.
  const endOf = (raw: string | null | undefined) => /^\s*\d{4}\s*$/.test(raw ?? "") ? new Date(Date.UTC(+raw!.trim(), 11, 1)) : parseLiDate(raw);
  const positions: Pos[] = p.positions.map(x => ({ ...x, s: parseLiDate(x.start), e: ONGOING.test(x.end ?? "") ? null : endOf(x.end), ongoing: !x.end || ONGOING.test(x.end) }))
    .sort((a, b) => (b.ongoing ? 1 : 0) - (a.ongoing ? 1 : 0) || (b.s?.getTime() ?? 0) - (a.s?.getTime() ?? 0));
  const posName = (x: Pos) => [x.title, x.company].filter(Boolean).join(" · ");
  if (!has("POSITIONS")) for (const id of ["exp.recent", "exp.numbers", "exp.titles", "exp.older"]) na(id, M.notDelivered);
  else if (!positions.length) for (const id of ["exp.recent", "exp.numbers", "exp.titles", "exp.older"]) graded(id, 0, [{ text: L(M.noPositions) }]);
  else {
    const recent = positions.slice(0, 2);
    const per = recent.map(x => {
      const n = resultStatements(x.description).length;
      return { x, n, share: n >= C.experience.minResults ? 1 : n >= 1 ? 0.5 : 0 };
    });
    graded("exp.recent", 4 * per.reduce((s, r) => s + r.share, 0) / per.length,
      per.filter(r => r.share < 1).map(r => ({ text: r.n ? L(M.fewResults, { n: r.n }) : L(M.noDescription), where: posName(r.x) })));
    const statements = positions.flatMap(x => resultStatements(x.description));
    const withNum = statements.filter(hasNumber).length;
    graded("exp.numbers", Math.min(3, withNum), withNum >= 3 ? [] : [{ text: L(M.numbers, { n: withNum }) }]);
    const cur = positions[0];
    if (!headline || !cur.title) graded("exp.titles", 0, [{ text: L(M.titleMismatch, { t: cur.title ?? "—" }) }]);
    else {
      const ht = new Set(tokens(headline));
      const overlap = tokens(cur.title).some(t => ht.has(t) || [...ht].some(h => h.length >= 5 && (h.includes(t) || t.includes(h))));
      // A title that contradicts the CV for the same role costs a point (needs the judge run).
      const conflicts = (input.cvFacts?.titleConflicts ?? []).map(x => ({ text: L(M.cvConflict, { a: x.linkedin, b: x.cv }) }));
      const findings = [...(overlap ? [] : [{ text: L(M.titleMismatch, { t: cur.title }), where: posName(cur) }]), ...conflicts];
      graded("exp.titles", Math.min(overlap ? 2 : 0, conflicts.length ? 1 : 2), findings);
    }
    const dated = positions.filter(x => x.s).sort((a, b) => a.s!.getTime() - b.s!.getTime());
    if (!dated.length) na("exp.older", M.noDates);
    else {
      const findings: CheckFinding[] = [];
      let reach = dated[0].ongoing ? now : (dated[0].e ?? dated[0].s!);
      for (const x of dated.slice(1)) {
        const gap = monthsBetween(reach, x.s!);
        if (gap > C.experience.gapMonths) findings.push({ text: L(M.gap, { n: gap, a: ym(reach), b: ym(x.s!) }) });
        const end = x.ongoing ? now : (x.e ?? x.s!);
        if (end > reach) reach = end;
      }
      const gapOk = !findings.length;
      const older = positions.slice(2).filter(x => (x.description ?? "").length > C.experience.olderMaxChars);
      older.forEach(x => findings.push({ text: L(M.olderLong, { n: (x.description ?? "").length }), where: posName(x) }));
      graded("exp.older", (gapOk ? 1 : 0) + (older.length ? 0 : 1), findings);
    }
  }
  selfCheck("exp.media");
  selfCheck("featured.present"); selfCheck("featured.strong"); selfCheck("featured.quality");

  // extras
  if (!has("PROJECTS")) na("extras.projects", M.notDelivered);
  else {
    const linked = p.projects.filter(x => x.url).length;
    graded("extras.projects", !p.projects.length ? 0 : linked ? 2 : 1,
      !p.projects.length ? [{ text: L(M.noInput) }] : linked ? [] : [{ text: L(M.noLink) }]);
  }
  if (!has("EDUCATION")) na("extras.education", M.notDelivered);
  else {
    const ok = p.education.some(e => e.school && e.degree);
    graded("extras.education", ok ? 1 : 0, ok ? [] : [{ text: p.education.length ? L(M.noDegree) : L(M.noInput) }]);
  }
  if (!has("CERTIFICATIONS")) na("extras.certs", M.notDelivered);
  else {
    const cutoff = new Date(now); cutoff.setUTCFullYear(cutoff.getUTCFullYear() - C.certRecentYears);
    const ok = p.certifications.some(x => { const d = parseLiDate(x.start); return !!d && d >= cutoff; });
    graded("extras.certs", ok ? 1 : 0, ok ? [] : [{ text: L(M.noRecentCert, { n: C.certRecentYears }) }]);
  }

  // ── C Evidence ──
  if (!has("SKILLS")) { na("skills.count", M.notDelivered); na("skills.endorsed", M.notDelivered); }
  else {
    const n = p.skills.length;
    graded("skills.count", n >= C.skills.full ? 2 : n >= C.skills.half ? 1 : 0, n >= C.skills.full ? [] : [{ text: L(M.count, { n }) }]);
    if (!n) graded("skills.endorsed", 0, [{ text: L(M.noInput) }]);
    else if (p.skills.some(s => s.endorsements == null)) na("skills.endorsed", M.notDelivered);
    else {
      const top = [...p.skills].sort((a, b) => (b.endorsements ?? 0) - (a.endorsements ?? 0)).slice(0, C.skills.topN);
      const ok = top.filter(s => (s.endorsements ?? 0) >= C.skills.endorsementsPerTop).length;
      graded("skills.endorsed", ok >= C.skills.topN ? 2 : ok >= 3 ? 1 : 0,
        top.filter(s => (s.endorsements ?? 0) < C.skills.endorsementsPerTop).map(s => ({ text: L(M.topEndorsed, { w: s.name, n: s.endorsements ?? 0 }) })));
    }
  }
  selfCheck("skills.top5"); selfCheck("skills.linked");

  if (!has("RECOMMENDATIONS")) for (const id of ["recs.count", "recs.recent", "recs.variety", "recs.concrete"]) na(id, M.notDelivered);
  else {
    const recs = p.recommendations.received;
    const n = recs.length;
    graded("recs.count", n >= 5 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0, n >= 5 ? [] : [{ text: L(M.count, { n }) }]);
    const cutoff = new Date(now); cutoff.setUTCFullYear(cutoff.getUTCFullYear() - C.recommendations.recentYears);
    const recent = recs.filter(r => { const d = parseLiDate(r.date); return !!d && d >= cutoff; }).length;
    graded("recs.recent", recent >= C.recommendations.recentMin ? 2 : recent >= 1 ? 1 : 0,
      recent >= C.recommendations.recentMin ? [] : [{ text: L(M.recent, { n: recent, y: C.recommendations.recentYears }) }]);
    const companies = new Set(recs.map(r => norm(r.company ?? r.author ?? "")).filter(Boolean)).size;
    graded("recs.variety", companies >= 3 ? 2 : companies >= 2 ? 1 : 0, companies >= 3 ? [] : [{ text: L(M.companies, { n: companies }) }]);
    const concrete = recs.some(r => (r.text ?? "").length >= C.recommendations.concreteMinChars);
    graded("recs.concrete", concrete ? 1 : 0, concrete ? [] : [{ text: L(M.noConcrete, { n: C.recommendations.concreteMinChars }) }]);
  }

  if (!has("HONORS")) na("honors.awards", M.notDelivered);
  else graded("honors.awards", p.honors.length ? 2 : 0, p.honors.length ? [] : [{ text: L(M.noInput) }]);
  if (!has("PUBLICATIONS") && !has("ARTICLES")) na("honors.publications", M.notDelivered);
  else {
    const n = p.publications.length + p.activity.articles.length;
    graded("honors.publications", n ? 1 : 0, n ? [] : [{ text: L(M.noInput) }]);
  }
  if (!has("LANGUAGES")) na("honors.languages", M.notDelivered);
  else {
    const ok = p.languages.some(l => l.proficiency);
    graded("honors.languages", ok ? 1 : 0, ok ? [] : [{ text: p.languages.length ? L(M.noLevel) : L(M.noInput) }]);
  }

  // ── D Activity ──
  const since = new Date(now.getTime() - C.activityDays * 86400000);
  const inWindow = <T extends { date?: string | null }>(xs: T[]) => xs.filter(x => { const d = parseLiDate(x.date); return !!d && d >= since && d <= now; });
  const postsDelivered = has("MEMBER_SHARE_INFO");
  if (!postsDelivered) { na("posts.rhythm", M.notDelivered); na("posts.own", M.notDelivered); }
  else {
    const recent = inWindow(p.activity.posts).length + inWindow(p.activity.articles).length;
    graded("posts.rhythm", recent >= 12 ? 4 : recent >= 4 ? 3 : recent >= 1 ? 2 : 0,
      recent >= 12 ? [] : [{ text: L(M.inDays, { n: recent, d: C.activityDays }) }]);
    const posts = p.activity.posts;
    const linksOnly = posts.filter(x => (x.text ?? "").trim().length < 80).length;
    const own = posts.length > 0 && linksOnly * 2 < posts.length;
    graded("posts.own", own ? 1 : 0, own ? [] : posts.length ? [{ text: L(M.linksOnly, { a: linksOnly, b: posts.length }) }] : [{ text: L(M.noInput) }]);
  }
  if (!postsDelivered) na("posts.topics", M.notDelivered);
  else llmCheck("posts.topics", p.activity.posts.length === 0 && p.activity.articles.length === 0);
  selfCheck("posts.formats");

  if (!has("ALL_COMMENTS")) na("comments.regular", M.notDelivered);
  else {
    const n = inWindow(p.activity.comments).filter(x => (x.text ?? "").trim().length >= 40).length;
    graded("comments.regular", n >= C.comments.full ? 2 : n >= 1 ? 1 : 0, n >= C.comments.full ? [] : [{ text: L(M.inDays, { n, d: C.activityDays }) }]);
  }
  selfCheck("comments.replies");

  const conn = p.network.connections;
  if (conn == null) na("network.size", M.notDelivered);
  else graded("network.size", conn >= C.network.full ? 2 : conn >= C.network.half ? 1 : 0, conn >= C.network.full ? [] : [{ text: L(M.connections, { n: conn }) }]);
  selfCheck("network.fit");
  if (!has("GROUPS")) na("network.groups", M.notDelivered);
  else { const n = p.network.groups.length; graded("network.groups", Math.min(2, n), n >= 2 ? [] : [{ text: L(M.groups, { n }) }]); }

  // ── AI visibility (separate) ──
  const aiOut: LiCheckOutcome[] = [];
  const mainCount = out.length;
  const name = [p.basics.firstName, p.basics.lastName].filter(Boolean).join(" ");
  if (!profileDelivered) na("ai.entity", M.notDelivered);
  else {
    const missing = [!name && "Name", !headline && "Headline", !p.basics.location && L(M.noLocation)].filter(Boolean) as string[];
    graded("ai.entity", missing.length ? 0 : 1, missing.length ? [{ text: L(M.entityMissing, { w: missing.join(", ") }) }] : []);
  }
  llmCheck("ai.niche");
  graded("ai.mentions", p.honors.length + p.publications.length + p.recommendations.received.length > 0 ? 1 : 0);
  llmCheck("ai.consistent");
  llmCheck("ai.answerable");
  if (!postsDelivered && !has("ALL_COMMENTS")) na("ai.recency", M.notDelivered);
  else {
    const dates = [...p.activity.posts, ...p.activity.comments, ...p.activity.articles].map(x => parseLiDate(x.date)).filter((d): d is Date => !!d && d <= now);
    const last = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
    const ok = !!last && last >= since;
    graded("ai.recency", ok ? 1 : 0, ok ? [] : [{ text: L(M.lastActivity, { w: last ? last.toISOString().slice(0, 10) : "—" }) }]);
  }
  if (!slug) na("ai.nameUrl", M.noUrl);
  else {
    const s = norm(decodeURIComponent(slug));
    const ok = [p.basics.firstName, p.basics.lastName].filter(Boolean).some(n => tokens(n!).some(t => s.includes(t)));
    graded("ai.nameUrl", ok ? 1 : 0, ok ? [] : [{ text: L(M.nameNotInUrl) }]);
  }
  if (!profileDelivered) na("ai.crossPlatform", M.notDelivered);
  else graded("ai.crossPlatform", p.basics.websites.length ? 1 : 0, p.basics.websites.length ? [] : [{ text: L(M.noWebsite) }]);
  aiOut.push(...out.splice(mainCount));

  // ── totals ──
  const rated = out.filter(o => o.status !== "na");
  const areaOf = (a: LiArea): LiAreaOutcome => {
    const xs = rated.filter(o => o.area === a);
    const score = Math.max(0, xs.reduce((s, o) => s + o.score, 0));
    const max = xs.reduce((s, o) => s + o.max, 0);
    return { score: round1(score), max, fullMax: C.areaMax[a], status: statusOf(max ? score / max : 0) };
  };
  const areas = { firstImpression: areaOf("firstImpression"), content: areaOf("content"), evidence: areaOf("evidence"), activity: areaOf("activity") };
  const earned = Object.values(areas).reduce((s, a) => s + a.score, 0);
  const ratedMax = Object.values(areas).reduce((s, a) => s + a.max, 0);
  const total = ratedMax ? Math.round((earned / ratedMax) * 100) : 0;
  const aiRated = aiOut.filter(o => o.status !== "na");

  // ── steps: missing points per group, biggest first ──
  const steps: LiStep[] = (C.groups as readonly { id: string; area: string; effort: LiEffort }[]).filter(g => g.area !== "ai").map(g => {
    const xs = rated.filter(o => o.group === g.id);
    const gain = xs.reduce((s, o) => s + (o.max - o.score), 0);
    const detail = xs.filter(o => o.status === "fail").map(o => o.label).join(", ");
    return { id: g.id, label: pick(STEP[g.id], uiLang), gain: round1(gain), effort: g.effort, detail: detail || undefined };
  }).filter(s => s.gain >= 0.5).sort((a, b) => b.gain - a.gain || effortRank(a.effort) - effortRank(b.effort));

  const notRated: LiNotRated[] = out.filter(o => o.status === "na").map(o => ({ id: o.id, label: o.label, kind: o.kind, max: o.max, why: o.findings[0]?.text ?? "" }));
  const selfOpen = notRated.filter(n => n.kind === "self").reduce((s, n) => s + n.max, 0);
  const llmOpen = notRated.filter(n => n.kind === "llm").reduce((s, n) => s + n.max, 0);
  const missingDomains = [...failed, ...(present ? ["PROFILE", "POSITIONS", "SKILLS", "RECOMMENDATIONS", "MEMBER_SHARE_INFO"].filter(d => !present.has(d) && !failed.has(d)) : [])];
  const recommendations: LiRecommendation[] = [
    { id: "goal", ok: !!targetRole, text: L(REC.goal) },
    { id: "self", ok: selfOpen === 0, text: L(REC.self, { n: selfOpen }) },
    { id: "llm", ok: llmOpen === 0, text: L(REC.llm, { n: llmOpen }) },
    ...(missingDomains.length ? [{ id: "domains", ok: false, text: L(REC.domains, { w: missingDomains.join(", ") }) }] : []),
  ];
  const profLang = detectTextLang([headline, summary].join("\n"));
  const wantLang = marketLang(input.goal?.market);
  if (profLang && wantLang && profLang !== wantLang) {
    recommendations.push({ id: "secondLang", ok: false, text: L(REC.secondLang, { a: pick(LANG_LABEL[profLang], uiLang), b: pick(LANG_LABEL[wantLang], uiLang) }) });
  }
  if (input.cvFacts?.missingInLinkedIn.length) {
    recommendations.push({ id: "cvMissing", ok: false, text: L(REC.cvMissing, { w: input.cvFacts.missingInLinkedIn.join(" · ") }) });
  }

  return {
    criteriaVersion: C.version, checkedAt: now.toISOString(), uiLang,
    total, rawTotal: total, acceptedGain: 0, accepted: [...acc],
    rated: { score: round1(earned), max: ratedMax },
    areas,
    ai: { score: round1(aiRated.reduce((s, o) => s + o.score, 0)), max: aiRated.reduce((s, o) => s + o.max, 0), fullMax: C.aiMax, checks: aiOut },
    checks: out, steps, recommendations, notRated,
    inputs: { source: p.meta.source, llm: !!llm, selfReported: Object.keys(self).length, targetRole: !!targetRole, missingDomains },
  };
}

const effortRank = (e: LiEffort) => (e === "minutes" ? 0 : e === "hours" ? 1 : 2);

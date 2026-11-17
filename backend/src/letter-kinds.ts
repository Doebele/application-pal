// Kind of application (job / Schnupperlehre / Lehrstelle / Praktikum) and the letter rules
// that depend on it, plus the deterministic salutation. Pure functions, no AI, no DB.
// Self-check: npx tsx backend/src/letter-kinds.check.ts

export type ApplicationKind = "job" | "schnupperlehre" | "lehrstelle" | "praktikum";
export type ContactGender = "f" | "m" | "x";
type Lang = "de" | "en" | "fr";

const KINDS: ApplicationKind[] = ["job", "schnupperlehre", "lehrstelle", "praktikum"];

export function normalizeKind(raw: string | null | undefined): ApplicationKind {
  return KINDS.includes(raw as ApplicationKind) ? (raw as ApplicationKind) : "job";
}

/** School-leaver kinds get their own letter rules. */
export function isSchoolKind(kind: ApplicationKind): boolean {
  return kind !== "job";
}

function langKey(lang: string | null | undefined): Lang {
  return lang === "en" || lang === "fr" ? lang : "de";
}

/**
 * Kind of application from the posting text. Schnupperlehre wins over Lehrstelle
 * (a taster posting usually mentions the apprenticeship too); null = nothing found.
 */
export function detectApplicationKind(text: string): ApplicationKind | null {
  const s = text.toLowerCase();
  if (/schnupper|stage d[ée]couverte|stage d'orientation|taster (day|week)|trial apprenticeship/.test(s)) return "schnupperlehre";
  if (/\blehrstelle|\blehre als|\blehrling|lernende[rn]?\b|\bausbildung(splatz)? (als|zum|zur)|\b(efz|eba)\b|\bcfc\b|\bafp\b|place d'apprentissage|\bapprenti|\bapprenticeship/.test(s)) return "lehrstelle";
  if (/\bpraktikum|\bpraktikant|\bstage\b|\binternship|\bintern\b/.test(s)) return "praktikum";
  return null;
}

/**
 * Apprenticeship title from the posting, e.g. "Schreiner/in EFZ" or "Informaticien CFC".
 * Only titles that carry the Swiss certificate suffix — anything else is too unreliable.
 */
export function detectApprenticeship(text: string): string | null {
  const m = text.match(/([A-ZÄÖÜÉÈ][\wäöüéèàç\/\-]*(?:[ \-][\wäöüéèàç\/\-]+){0,4}) (EFZ|EBA|CFC|AFP)\b/);
  if (!m) return null;
  // Drop the lead-in ("Lehrstelle als …", "Place d'apprentissage d'…")
  const title = m[1].trim()
    .replace(/^.*\b(als|zum|zur|comme)\s+/i, "")
    .replace(/^(lehrstelle|lehre|schnupperlehre|ausbildung|place d'apprentissage|apprentissage)\s+(d'|de\s+)?/i, "")
    .trim();
  return title ? `${title} ${m[2]}` : null;
}

function lastName(name: string): string {
  const parts = name.trim().replace(/\s+/g, " ").split(" ");
  return parts[parts.length - 1] ?? name;
}

/**
 * The salutation line, built in code so the model can't get the grammar wrong
 * ("Sehr geehrtes Herrn"). gender: f / m / x (neutral → full name); no name → generic.
 */
export function buildSalutation(lang: string | null | undefined, name: string | null | undefined, gender: string | null | undefined): string {
  const l = langKey(lang);
  const n = (name ?? "").trim().replace(/^(frau|herr|herrn|mrs?\.?|ms\.?|madame|monsieur)\s+/i, "");
  if (!n) return { de: "Sehr geehrte Damen und Herren", en: "Dear Sir or Madam", fr: "Madame, Monsieur," }[l];
  if (gender === "f") return { de: `Sehr geehrte Frau ${lastName(n)}`, en: `Dear Ms ${lastName(n)}`, fr: "Madame," }[l];
  if (gender === "m") return { de: `Sehr geehrter Herr ${lastName(n)}`, en: `Dear Mr ${lastName(n)}`, fr: "Monsieur," }[l];
  if (gender === "x") return { de: `Guten Tag ${n}`, en: `Dear ${n}`, fr: `Bonjour ${n},` }[l];
  return "";
}

/** Prompt line that pins the salutation; "" when the gender of a named contact is unknown. */
export function salutationPrompt(lang: string | null | undefined, name: string | null | undefined, gender: string | null | undefined): string {
  const s = buildSalutation(lang, name, gender);
  if (!s) return "";
  return `Anrede: Beginne den Brief mit genau dieser Anrede, wörtlich und unverändert: "${s}". Keine andere Anrede verwenden.`;
}

const KIND_LABEL: Record<ApplicationKind, string> = {
  job: "Stelle",
  schnupperlehre: "Schnupperlehre (Schnuppertage / Schnupperwoche)",
  lehrstelle: "Lehrstelle (berufliche Grundbildung)",
  praktikum: "Praktikum",
};

/** Upper word limit of the letter body: half an A4 page for school leavers. */
export function letterWordLimit(kind: ApplicationKind): number {
  return kind === "schnupperlehre" ? 180 : isSchoolKind(kind) ? 220 : 350;
}

/**
 * System-prompt block for school leavers. Replaces the job-seeker rules (CV numbers,
 * 350 words) — a 15-year-old has no quantified results and must not sound like a manager.
 */
export function schoolLeaverRules(kind: ApplicationKind, apprenticeship: string | null | undefined): string {
  if (!isSchoolKind(kind)) return "";
  const beruf = apprenticeship?.trim() ? ` als ${apprenticeship.trim()}` : "";
  const focus = kind === "schnupperlehre"
    ? `Ton: neugierig, offen, interessiert. Kernaussage: "Ich möchte Sie und den Beruf kennenlernen." Fokus: Einblick bekommen, herausfinden, ob der Beruf passt.
Schluss: freundliche Bitte um Schnuppertage (falls bekannt mit möglichem Zeitraum), nicht unterwürfig.`
    : kind === "lehrstelle"
    ? `Ton: selbstbewusst, überzeugend, verbindlich. Kernaussage: "Ich möchte bei Ihnen lernen." Fokus: eine überlegte, langfristige Entscheidung für Beruf und Betrieb.
Stärkstes Argument: eine bereits gemachte Schnupperlehre (besonders im selben Betrieb) — wenn die Angaben eine erwähnen, baue sie konkret ein (was gemacht, was gefallen hat).
Schluss: Wunsch nach einem Vorstellungsgespräch, freundlich und selbstbewusst.`
    : `Ton: interessiert und verbindlich. Fokus: was die Person im Praktikum lernen und beitragen möchte.
Schluss: Wunsch nach einem Gespräch.`;
  return `## Bewerbung einer Schulabgängerin / eines Schulabgängers: ${KIND_LABEL[kind]}${beruf}
Schreibe so, wie eine gut vorbereitete Jugendliche / ein gut vorbereiteter Jugendlicher (ca. 14–16 Jahre) schreibt: einfache, klare Sätze, ehrlich und persönlich — nicht wie eine Führungskraft, kein Business-Jargon, keine Zahlen-Erfolge.
Der Betrieb will vier Dinge sehen: 1. Motivation (warum genau dieser Beruf und dieser Betrieb), 2. Passung (passt das Profil zum Berufsbild), 3. Zuverlässigkeit, 4. Persönlichkeit.
Aufbau (höchstens eine halbe A4-Seite, max. ${letterWordLimit(kind)} Wörter):
1. Einleitung: worauf bewirbst du dich${beruf ? ` (${beruf.trim()})` : ""} und woher kennst du den Betrieb. Erster Satz direkt, z.B. "Ich bewerbe mich um …" — nie "Hiermit möchte ich …".
2. Warum dieser Beruf: was reizt daran, mit einem konkreten Erlebnis (Werkunterricht, Hobby, Projekt, Familie) statt allgemeiner Aussagen.
3. Warum dieser Betrieb: ein konkretes Projekt, Produkt oder die Philosophie des Betriebs aus der Ausschreibung oder den Angaben — zeigt echte Recherche. Den Betrieb beim Namen nennen, nicht nur "Ihr Unternehmen".
4. Was bringst du mit: Praxisbezug aus Schule, Hobbys, Projekten, Ämtli, Taschengeldjobs; jede Stärke mit einem Beispiel belegt ("zeig es, sag es nicht").
5. Schluss (siehe unten).
${focus}
Weglassen: den Lebenslauf nacherzählen; Floskeln wie "Hiermit bewerbe ich mich mit grossem Interesse"; Selbstbewertungen ohne Beispiel ("ich bin kreativ und teamfähig", "ich bin fleissig"); private Gründe, ausser sie stützen die Motivation.
Erfinde keine Erlebnisse, Noten, Schnupperlehren oder Erfahrungen. Fehlt ein konkretes Beispiel in den Angaben, setze einen Platzhalter in eckigen Klammern, z.B. "[Beispiel: wo hast du das schon gemacht?]".
Kein Wort auffällig oft wiederholen. Rechtschreibung fehlerfrei (Schweizer Schreibweise: ss statt ß).`;
}

/** Short note for the review prompt: judge the letter by the school-leaver standard. */
export function schoolLeaverReviewNote(kind: ApplicationKind): string {
  if (!isSchoolKind(kind)) return "";
  return `Dies ist eine Bewerbung für eine ${KIND_LABEL[kind]} von einer Schulabgängerin / einem Schulabgänger. Miss das Anschreiben am Massstab für Jugendliche, nicht an dem für Berufserfahrene: angemessen sind höchstens eine halbe A4-Seite (max. ${letterWordLimit(kind)} Wörter), einfache Sprache, Belege aus Schule/Hobby/Projekten statt Zahlen-Erfolgen. Prüfe besonders Motivation (warum dieser Beruf, warum dieser Betrieb), Passung zum Berufsbild, Zuverlässigkeit und Persönlichkeit, ob der Betrieb konkret genannt wird, ob Stärken mit Beispielen belegt sind und ob der Ton passt (${kind === "schnupperlehre" ? "neugierig, kennenlernen wollen" : "selbstbewusst, bei Ihnen lernen wollen"}). Formuliere Kritik ermutigend und per Du.`;
}

// ─── Pupil profile (persona schulabgaenger) ────────────────────────────────
// Stored as JSON in user_profile.school_profile. Mirror: frontend/src/components/SchoolProfileSection.tsx

export type SchoolExperienceKind = "schule" | "hobby" | "verein" | "job" | "schnupper" | "anderes";
export type SchoolProfile = {
  school?: string;                                                   // "Sek A, 9. Klasse, Abschluss 2027"
  favoriteSubjects?: string;                                         // free text incl. "why"
  wishJobs?: { title: string; why?: string; since?: string }[];      // motivation per trade
  experiences?: { kind: SchoolExperienceKind; title: string; what?: string; liked?: string; company?: string }[];
  strengths?: { strength: string; example?: string }[];              // strength → example
  tests?: SchoolTest[];                                              // Stellwerk, Lernpass plus, Multicheck, Basic-Check
};

/** Scale of a school test: stellwerk = 200–800 (norm mean 500), stanine = 1–9 (Lernpass plus PSM), percent = 0–100. */
export type TestScale = "stellwerk" | "stanine" | "percent";
export type SchoolTest = { name: string; date?: string; scale: TestScale; results: { area: string; score: number }[] };
export type TestLevel = "high" | "above" | "average" | "low";

/** Answers from the letter workspace for one school application (aiResultsCache["letter-inputs"].school). */
export type SchoolAnswers = {
  knownFrom?: string;        // how the pupil knows the company
  whyJob?: string;           // why this trade
  whyCompany?: string;       // why this company (research)
  experiences?: string[];    // picked experiences / strengths (already formatted lines)
  schnupperHere?: "yes" | "no" | "";
  schnupperNotes?: string;   // what was done / liked during the taster here
};

const EXP_KINDS: SchoolExperienceKind[] = ["schule", "hobby", "verein", "job", "schnupper", "anderes"];
const EXP_LABEL: Record<SchoolExperienceKind, string> = {
  schule: "Schule / Projekt", hobby: "Hobby", verein: "Verein / Ämtli", job: "Taschengeldjob", schnupper: "Schnupperlehre", anderes: "Sonstiges",
};

const str = (v: unknown, max = 600): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseSchoolProfile(raw: string | null | undefined): SchoolProfile {
  if (!raw) return {};
  let j: Record<string, unknown>;
  try { j = JSON.parse(raw); } catch { return {}; }
  if (!j || typeof j !== "object") return {};
  const arr = (v: unknown) => (Array.isArray(v) ? v.slice(0, 30) : []) as Record<string, unknown>[];
  return {
    school: str(j.school, 200),
    favoriteSubjects: str(j.favoriteSubjects),
    wishJobs: arr(j.wishJobs).map(w => ({ title: str(w.title, 120), why: str(w.why), since: str(w.since, 300) })).filter(w => w.title),
    experiences: arr(j.experiences).map(e => ({
      kind: (EXP_KINDS.includes(e.kind as SchoolExperienceKind) ? e.kind : "anderes") as SchoolExperienceKind,
      title: str(e.title, 160), what: str(e.what), liked: str(e.liked), company: str(e.company, 160),
    })).filter(e => e.title),
    strengths: arr(j.strengths).map(s => ({ strength: str(s.strength, 120), example: str(s.example) })).filter(s => s.strength),
    tests: arr(j.tests).map(normalizeTest).filter((t): t is SchoolTest => !!t),
  };
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(efz|eba|cfc|afp)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Does a wish job match the apprenticeship? Compares the stem of the first word ("Schreiner/in EFZ" ~ "Schreinerin"). */
export function sameTrade(a: string, b: string): boolean {
  const x = norm(a).split(" ")[0] ?? "", y = norm(b).split(" ")[0] ?? "";
  if (x.length < 4 || y.length < 4) return false;
  const stem = (w: string) => w.replace(/(in|innen|e|er)$/, "");
  return stem(x) === stem(y) || x.startsWith(y) || y.startsWith(x);
}

function sameCompany(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
}

/** Pupil profile as a prompt block; the wish job matching this application and a taster in this company come first. */
export function formatSchoolProfile(p: SchoolProfile, apprenticeship?: string | null, company?: string | null): string {
  const lines: string[] = [];
  if (p.school) lines.push(`Schule: ${p.school}`);
  if (p.favoriteSubjects) lines.push(`Lieblingsfächer: ${p.favoriteSubjects}`);
  const jobs = [...(p.wishJobs ?? [])].sort((a, b) => Number(!!apprenticeship && sameTrade(b.title, apprenticeship)) - Number(!!apprenticeship && sameTrade(a.title, apprenticeship)));
  if (jobs.length) {
    lines.push("Wunschberufe und Motivation:");
    for (const w of jobs) {
      const match = apprenticeship && sameTrade(w.title, apprenticeship) ? " (passt zu dieser Bewerbung)" : "";
      lines.push(`- ${w.title}${match}${w.why ? `: ${w.why}` : ""}${w.since ? ` — gemerkt: ${w.since}` : ""}`);
    }
  }
  if (p.experiences?.length) {
    lines.push("Erfahrungen:");
    for (const e of p.experiences) {
      const here = e.kind === "schnupper" && company && e.company && sameCompany(e.company, company) ? " — IN DIESEM BETRIEB" : "";
      lines.push(`- ${EXP_LABEL[e.kind]}: ${e.title}${e.company ? ` (${e.company})` : ""}${here}${e.what ? `. Gemacht: ${e.what}` : ""}${e.liked ? `. Gefallen: ${e.liked}` : ""}`);
    }
  }
  if (p.strengths?.length) {
    lines.push("Stärken (Stärke → Beispiel):");
    for (const s of p.strengths) lines.push(`- ${s.strength} → ${s.example || "(noch kein Beispiel — im Brief nicht behaupten, sondern Platzhalter setzen)"}`);
  }
  return [lines.length ? `## Schülerprofil\n${lines.join("\n")}` : "", formatSchoolTests(p.tests)].filter(Boolean).join("\n\n");
}

/** The pupil's answers for this one application, as a prompt block (all optional). */
export function formatSchoolAnswers(a: SchoolAnswers | null | undefined, kind: ApplicationKind): string {
  if (!a || !isSchoolKind(kind)) return "";
  const lines: string[] = [];
  if (str(a.knownFrom)) lines.push(`Woher ich den Betrieb kenne: ${str(a.knownFrom, 300)}`);
  if (str(a.whyJob)) lines.push(`Warum dieser Beruf: ${str(a.whyJob, 800)}`);
  if (str(a.whyCompany)) lines.push(`Warum dieser Betrieb (Recherche): ${str(a.whyCompany, 800)}`);
  const ex = (Array.isArray(a.experiences) ? a.experiences : []).map(x => str(x, 400)).filter(Boolean).slice(0, 6);
  if (ex.length) lines.push(`Was ich mitbringe (unbedingt verwenden):\n${ex.map(x => `- ${x}`).join("\n")}`);
  if (kind === "lehrstelle" && a.schnupperHere === "yes") {
    lines.push(`Ich habe in diesem Betrieb bereits geschnuppert${str(a.schnupperNotes) ? `: ${str(a.schnupperNotes, 600)}` : ""} — das ist das stärkste Argument, baue es konkret ein.`);
  } else if (kind === "lehrstelle" && a.schnupperHere === "no") {
    lines.push("In diesem Betrieb habe ich noch nicht geschnuppert — nichts anderes behaupten; eine Schnupperlehre anbieten ist erlaubt.");
  }
  return lines.length ? `## Antworten der Schülerin / des Schülers zu dieser Bewerbung (verbindlich, nichts dazuerfinden)\n${lines.join("\n")}` : "";
}

/** letter-angles for school kinds: same JSON shape, school-specific meaning of the three groups. */
export function schoolAnglesTask(kind: ApplicationKind, apprenticeship?: string | null): string {
  return `Du hilfst einer Schulabgängerin / einem Schulabgänger bei einer Bewerbung für eine ${KIND_LABEL[kind]}${apprenticeship ? ` als ${apprenticeship}` : ""}. Schlage Bausteine für das Anschreiben vor, in einfacher Sprache, nichts erfinden:
- "beruehrungspunkte": 3-4 konkrete Merkmale DIESES Betriebs aus der Ausschreibung (Projekte, Produkte, Ausbildung, Philosophie), auf die man sich beziehen kann — "titel" = Merkmal, "text" = ein Satz, wie die Schülerin / der Schüler darauf Bezug nehmen kann.
- "werteMatch": 2-4 Gründe für den Beruf aus dem Schülerprofil — "wert" = Grund (z.B. "Arbeiten mit Holz"), "bezug" = wie das zu Beruf und Betrieb passt.
- "nutzenArgumente": 3-4 Dinge, die die Person mitbringt — "argument" = Stärke oder Erfahrung, "beleg" = das konkrete Beispiel aus dem Schülerprofil; fehlt eines, schreibe "[Beispiel ergänzen]".`;
}

// ─── School tests (Stellwerk, Lernpass plus, Multicheck, Basic-Check) ─────

const SCALES: TestScale[] = ["stellwerk", "stanine", "percent"];

/** Scale from the test name when none is given: Stellwerk → 200–800, PSM/Persönlichkeit → 1–9, Multicheck/Basic-Check → %. */
export function guessScale(name: string): TestScale {
  const n = name.toLowerCase();
  if (/psm|persönlich|personlich|lernpass plus p/.test(n)) return "stanine";
  if (/multicheck|basic.?check|%/.test(n)) return "percent";
  return "stellwerk";
}

export function normalizeTest(raw: unknown): SchoolTest | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const name = str(t.name, 120);
  if (!name) return null;
  const scale = SCALES.includes(t.scale as TestScale) ? (t.scale as TestScale) : guessScale(name);
  const [lo, hi] = scale === "stellwerk" ? [200, 800] : scale === "stanine" ? [1, 9] : [0, 100];
  const results = (Array.isArray(t.results) ? t.results.slice(0, 40) : [])
    .map(r => ({ area: str((r as Record<string, unknown>)?.area, 120), score: Number((r as Record<string, unknown>)?.score) }))
    .filter(r => r.area && Number.isFinite(r.score) && r.score >= lo && r.score <= hi);
  return { name, date: str(t.date, 40), scale, results };
}

/** Level of one result. Stellwerk is normed to mean 500 / SD 100; stanine to mean 5. */
export function testLevel(scale: TestScale, score: number): TestLevel {
  if (scale === "stellwerk") return score >= 600 ? "high" : score >= 550 ? "above" : score >= 450 ? "average" : "low";
  if (scale === "stanine") return score >= 8 ? "high" : score >= 7 ? "above" : score >= 4 ? "average" : "low";
  return score >= 80 ? "high" : score >= 65 ? "above" : score >= 45 ? "average" : "low";
}

const LEVEL_TEXT: Record<"high" | "above", string> = { high: "deutlich über dem Durchschnitt", above: "über dem Durchschnitt" };

/**
 * Only results above average reach the prompt — a letter never mentions a weak result, and the
 * personality profile (a self-assessment) only hints which strengths to prove with an example.
 */
export function formatSchoolTests(tests: SchoolTest[] | undefined): string {
  const perf: string[] = [], persona: string[] = [];
  for (const t of tests ?? []) {
    for (const r of t.results) {
      const lvl = testLevel(t.scale, r.score);
      if (lvl !== "high" && lvl !== "above") continue;
      if (t.scale === "stanine") persona.push(`- ${r.area} (${LEVEL_TEXT[lvl]})`);
      else perf.push(`- ${t.name}${t.date ? ` (${t.date})` : ""}, ${r.area}: ${r.score}${t.scale === "percent" ? " %" : " Punkte"} — ${LEVEL_TEXT[lvl]}${t.scale === "stellwerk" ? " (Skala 200–800, Durchschnitt 500)" : ""}`);
    }
  }
  if (!perf.length && !persona.length) return "";
  const out = ["## Schultests (nur die starken Ergebnisse)"];
  if (perf.length) out.push(`Leistungstests:\n${perf.join("\n")}\nErwähne höchstens ein oder zwei Ergebnisse, und nur solche, die zum Lehrberuf passen (z.B. technisches Verständnis für technische Berufe, Sprachen für kaufmännische Berufe). Punktzahlen nur genau wie hier angegeben. Schwächere Ergebnisse gibt es hier bewusst nicht — nie Testergebnisse erfinden oder abschwächen.`);
  if (persona.length) out.push(`Persönlichkeitsprofil (Selbsteinschätzung, nicht zitieren):\n${persona.join("\n")}\nDiese Eigenschaften dürfen nur als Stärke erscheinen, wenn das Schülerprofil ein Beispiel dafür liefert — nie "laut Test bin ich …".`);
  return out.join("\n");
}

/** Prompt that extracts test results from a test report's text (OCR'd scans are messy). */
export const SCHOOL_TEST_EXTRACT_PROMPT = `Du liest den Text eines Schweizer Schultest-Berichts (z.B. Stellwerk 8/9, Lernpass plus, Multicheck, Basic-Check). Der Text kann aus einem Scan stammen und Fehler enthalten.
Extrahiere jeden Test mit Name, Datum/Semester und den Ergebnissen pro Bereich. Nimm nur Zahlen, die klar im Text stehen — nichts schätzen, nichts aus Grafikpositionen ableiten.
- Stellwerk-Leistungstests: Punkte 200–800 ("569 Punkte", "Gesamtwert: 541") → "scale": "stellwerk".
- Lernpass plus PSM (Persönlichkeitsprofil): Werte 1–9 aus der Spalte "SW" pro Inhalt (z.B. "Belastbarkeit 2") → "scale": "stanine".
- Multicheck / Basic-Check: Prozentwerte → "scale": "percent".
Antworte NUR mit JSON: { "tests": [ { "name": "<z.B. Stellwerk 8>", "date": "<z.B. Frühjahr 2025>", "scale": "stellwerk|stanine|percent", "results": [ { "area": "<Bereich, z.B. Mathematik>", "score": <Zahl> } ] } ] }`;

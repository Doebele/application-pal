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

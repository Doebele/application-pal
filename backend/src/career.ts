// Career-choice help (phase 5e): match a pupil's interests, favourite subjects, strengths WITH an
// example and strong school-test results to Swiss apprenticeship trades. Pure logic, no AI, no
// external call. Rules — don't "fix" them:
// - The result is a list of ideas with reasons, never a verdict or a "best trade".
// - A weak or average test result never counts (only testLevel() high/above), and the personality
//   profile (stanine, a self-assessment) is never used.
// - A strength without an example never counts.
// - The catalogue is our own short summary; it is not an official list (link to berufsberatung.ch).
// Self-check: npx tsx backend/src/career.check.ts
import { sameTrade, testLevel, type SchoolProfile, type TestLevel } from "./letter-kinds.js";

export const INTEREST_AREAS = [
  "build", "tech", "vehicles", "it", "nature", "outdoor", "care", "health", "sales", "office", "creative", "food", "lab", "logistics",
] as const;
export type InterestArea = typeof INTEREST_AREAS[number];
/** 0 = not for me, 1 = a bit, 2 = a lot. */
export type InterestRating = 0 | 1 | 2;
export type Interests = Partial<Record<InterestArea, InterestRating>>;

export const SUBJECTS = ["math", "german", "languages", "science", "design", "crafts", "sport", "it", "food"] as const;
/** Abilities a test can show beyond school subjects. */
export const ABILITIES = ["spatial", "logic", "technical"] as const;
export type Skill = typeof SUBJECTS[number] | typeof ABILITIES[number];
export const TRAITS = ["manual", "precise", "social", "caring", "creative", "logic", "organized", "physical"] as const;
export type Trait = typeof TRAITS[number];

export type Trade = {
  id: string;
  name: { de: string; fr: string; en: string };
  level: "EFZ" | "EBA";
  years: number;
  primary: InterestArea[];
  secondary: InterestArea[];
  skills: Skill[];
  traits: Trait[];
};

// [id, de, fr, en, years, "primary|secondary", skills, traits]
type Row = [string, string, string, string, number, string, string, string];
const ROWS: Row[] = [
  ["zimmermann", "Zimmermann/Zimmerin EFZ", "Charpentier/ère CFC", "Carpenter (timber construction)", 4, "build|outdoor creative", "math spatial crafts", "manual physical precise"],
  ["schreiner", "Schreiner/in EFZ", "Ébéniste / Menuisier/ère CFC", "Joiner / cabinetmaker", 4, "build creative|tech", "math spatial crafts design", "manual precise creative"],
  ["maurer", "Maurer/in EFZ", "Maçon/ne CFC", "Bricklayer", 3, "build outdoor|", "math spatial", "physical manual"],
  ["strassenbauer", "Strassenbauer/in EFZ", "Constructeur/trice de routes CFC", "Road builder", 3, "build outdoor|vehicles", "spatial", "physical manual"],
  ["elektroinstallateur", "Elektroinstallateur/in EFZ", "Installateur/trice-électricien/ne CFC", "Electrician", 4, "tech build|", "math science technical logic", "precise manual logic"],
  ["montage-elektriker", "Montage-Elektriker/in EFZ", "Électricien/ne de montage CFC", "Installation electrician", 3, "tech build|", "math technical", "manual precise"],
  ["sanitaer", "Sanitärinstallateur/in EFZ", "Installateur/trice sanitaire CFC", "Plumber", 3, "build tech|", "math spatial technical", "manual physical"],
  ["heizung", "Heizungsinstallateur/in EFZ", "Installateur/trice en chauffage CFC", "Heating installer", 3, "build tech|", "math spatial technical", "manual physical"],
  ["maler", "Maler/in EFZ", "Peintre CFC", "Painter and decorator", 3, "build creative|", "design crafts", "manual precise creative"],
  ["gipser", "Gipser/in-Trockenbauer/in EFZ", "Plâtrier/ère constructeur/trice à sec CFC", "Plasterer / drywall builder", 3, "build|creative", "spatial crafts", "manual physical"],
  ["polymechaniker", "Polymechaniker/in EFZ", "Polymécanicien/ne CFC", "Polymechanic", 4, "tech|it", "math science spatial technical", "precise logic manual"],
  ["konstrukteur", "Konstrukteur/in EFZ", "Constructeur/trice CFC", "Mechanical design draughtsperson", 4, "tech|it creative", "math spatial technical logic", "precise logic"],
  ["automatiker", "Automatiker/in EFZ", "Automaticien/ne CFC", "Automation technician", 4, "tech it|", "math science technical logic", "logic precise"],
  ["elektroniker", "Elektroniker/in EFZ", "Électronicien/ne CFC", "Electronics technician", 4, "tech it|lab", "math science logic technical", "precise logic"],
  ["metallbauer", "Metallbauer/in EFZ", "Constructeur/trice métallique CFC", "Metal construction worker", 4, "tech build|creative", "math spatial technical", "manual physical precise"],
  ["automobil-mechatroniker", "Automobil-Mechatroniker/in EFZ", "Mécatronicien/ne d'automobiles CFC", "Automotive mechatronics technician", 4, "vehicles tech|it", "math science technical logic", "logic manual precise"],
  ["automobil-fachmann", "Automobil-Fachmann/-Fachfrau EFZ", "Mécanicien/ne en maintenance d'automobiles CFC", "Automotive service technician", 3, "vehicles tech|", "technical", "manual precise"],
  ["landmaschinen", "Landmaschinenmechaniker/in EFZ", "Mécanicien/ne en machines agricoles CFC", "Agricultural machinery mechanic", 4, "vehicles nature|tech outdoor", "technical", "manual physical"],
  ["fahrrad", "Fahrradmechaniker/in EFZ", "Mécanicien/ne en cycles CFC", "Bicycle mechanic", 3, "vehicles|sales", "technical sport", "manual"],
  ["strassentransport", "Strassentransportfachmann/-frau EFZ", "Conducteur/trice de véhicules lourds CFC", "Truck driver", 3, "vehicles logistics|outdoor", "technical", "organized"],
  ["logistiker", "Logistiker/in EFZ", "Logisticien/ne CFC", "Logistics specialist", 3, "logistics|vehicles office", "math", "organized physical"],
  ["logistiker-eba", "Logistiker/in EBA", "Logisticien/ne AFP", "Logistics assistant", 2, "logistics|vehicles", "", "organized physical"],
  ["betriebsunterhalt", "Fachmann/Fachfrau Betriebsunterhalt EFZ", "Agent/e d'exploitation CFC", "Facility maintenance specialist", 3, "build tech|outdoor", "technical crafts", "manual organized"],
  ["haustechnikpraktiker", "Haustechnikpraktiker/in EBA", "Aide en technique du bâtiment AFP", "Building services assistant", 2, "build tech|", "technical", "manual"],
  ["schreinerpraktiker", "Schreinerpraktiker/in EBA", "Aide-menuisier/ère AFP", "Joinery assistant", 2, "build|creative", "crafts", "manual"],
  ["zeichner-architektur", "Zeichner/in EFZ Architektur", "Dessinateur/trice CFC architecture", "Draughtsperson (architecture)", 4, "build creative|it", "math spatial design", "precise creative"],
  ["detailhandel", "Detailhandelsfachmann/-frau EFZ", "Gestionnaire du commerce de détail CFC", "Retail specialist", 3, "sales|", "german languages", "social organized"],
  ["detailhandel-eba", "Detailhandelsassistent/in EBA", "Assistant/e du commerce de détail AFP", "Retail assistant", 2, "sales|logistics", "german", "social"],
  ["kaufmann", "Kaufmann/Kauffrau EFZ", "Employé/e de commerce CFC", "Commercial employee", 3, "office|sales it", "german languages math", "organized precise social"],
  ["bueroassistent", "Büroassistent/in EBA", "Assistant/e de bureau AFP", "Office assistant", 2, "office|", "german it", "organized"],
  ["hotel-kommunikation", "Hotel-Kommunikationsfachmann/-frau EFZ", "Spécialiste en communication hôtelière CFC", "Hotel communications specialist", 3, "office sales|food", "languages german", "social organized"],
  ["informatiker-app", "Informatiker/in EFZ Applikationsentwicklung", "Informaticien/ne CFC développement d'applications", "IT specialist (application development)", 4, "it|creative", "math logic it languages", "logic precise"],
  ["informatiker-plattform", "Informatiker/in EFZ Plattformentwicklung", "Informaticien/ne CFC exploitation et infrastructure", "IT specialist (platform development)", 4, "it|tech", "math logic it", "logic organized"],
  ["ict-fachmann", "ICT-Fachmann/-Fachfrau EFZ", "Opérateur/trice en informatique CFC", "ICT specialist (user support)", 3, "it|office", "it logic", "social logic"],
  ["mediamatiker", "Mediamatiker/in EFZ", "Médiamaticien/ne CFC", "Mediamatician", 4, "it creative|office", "it design languages", "creative organized"],
  ["interactive-media", "Interactive Media Designer EFZ", "Interactive Media Designer CFC", "Interactive media designer", 4, "creative it|", "design it", "creative logic"],
  ["grafiker", "Grafiker/in EFZ", "Graphiste CFC", "Graphic designer", 4, "creative|it", "design", "creative precise"],
  ["polygraf", "Polygraf/in EFZ", "Polygraphe CFC", "Polygrapher (media production)", 4, "creative it|", "design it", "creative precise"],
  ["fotograf", "Fotograf/in EFZ", "Photographe CFC", "Photographer", 4, "creative|it", "design it", "creative"],
  ["bekleidung", "Bekleidungsgestalter/in EFZ", "Créateur/trice de vêtements CFC", "Clothing designer / tailor", 3, "creative|sales", "crafts design", "creative precise manual"],
  ["coiffeur", "Coiffeur/Coiffeuse EFZ", "Coiffeur/euse CFC", "Hairdresser", 3, "creative|sales care", "design", "creative social manual"],
  ["kosmetiker", "Kosmetiker/in EFZ", "Esthéticien/ne CFC", "Beautician", 3, "care creative|health sales", "science", "social precise"],
  ["fage", "Fachmann/Fachfrau Gesundheit EFZ", "Assistant/e en soins et santé communautaire CFC", "Health care assistant", 3, "health care|", "science german", "caring social"],
  ["fabe", "Fachmann/Fachfrau Betreuung EFZ", "Assistant/e socio-éducatif/ve CFC", "Social care worker", 3, "care|creative", "german", "caring social creative"],
  ["aga", "Assistent/in Gesundheit und Soziales EBA", "Aide en soins et accompagnement AFP", "Health and social care aide", 2, "care health|", "german", "caring social"],
  ["mpa", "Medizinische/r Praxisassistent/in EFZ", "Assistant/e médical/e CFC", "Medical practice assistant", 3, "health office|", "science german languages", "organized social precise"],
  ["dentalassistent", "Dentalassistent/in EFZ", "Assistant/e dentaire CFC", "Dental assistant", 3, "health|office", "science", "precise social"],
  ["pharma-assistent", "Pharma-Assistent/in EFZ", "Assistant/e en pharmacie CFC", "Pharmacy assistant", 3, "health sales|lab", "science german", "precise social"],
  ["drogist", "Drogist/in EFZ", "Droguiste CFC", "Druggist", 4, "health sales|lab nature", "science german", "social precise"],
  ["augenoptiker", "Augenoptiker/in EFZ", "Opticien/ne CFC", "Optician", 4, "health sales|tech", "math science", "precise social"],
  ["zahntechniker", "Zahntechniker/in EFZ", "Technicien/ne dentaire CFC", "Dental technician", 4, "health creative|lab", "crafts design spatial", "precise manual"],
  ["tiermedizin", "Tiermedizinische/r Praxisassistent/in EFZ", "Assistant/e en médecine vétérinaire CFC", "Veterinary practice assistant", 3, "nature health|office", "science", "caring precise"],
  ["laborant", "Laborant/in EFZ", "Laborantin/e CFC", "Laboratory technician", 3, "lab|health nature", "science math", "precise logic"],
  ["chemie-pharmatechnologe", "Chemie- und Pharmatechnologe/-technologin EFZ", "Technologue en production chimique et pharmaceutique CFC", "Chemical and pharmaceutical technologist", 3, "lab tech|", "science math technical", "precise organized"],
  ["gaertner", "Gärtner/in EFZ", "Horticulteur/trice CFC", "Gardener", 3, "nature outdoor|build creative", "science", "physical manual"],
  ["florist", "Florist/in EFZ", "Fleuriste CFC", "Florist", 3, "creative nature|sales", "design", "creative manual"],
  ["landwirt", "Landwirt/in EFZ", "Agriculteur/trice CFC", "Farmer", 3, "nature outdoor|vehicles", "science", "physical manual organized"],
  ["tierpfleger", "Tierpfleger/in EFZ", "Gardien/ne d'animaux CFC", "Animal keeper", 3, "nature|care outdoor", "science", "caring physical"],
  ["forstwart", "Forstwart/in EFZ", "Forestier/ère-bûcheron/ne CFC", "Forester", 3, "outdoor nature|", "science sport", "physical"],
  ["koch", "Koch/Köchin EFZ", "Cuisinier/ère CFC", "Cook", 3, "food|creative", "food", "creative physical organized"],
  ["kuechenangestellter", "Küchenangestellte/r EBA", "Employé/e en cuisine AFP", "Kitchen assistant", 2, "food|", "food", "manual"],
  ["baecker", "Bäcker/in-Konditor/in-Confiseur/in EFZ", "Boulanger/ère-pâtissier/ère-confiseur/euse CFC", "Baker-confectioner", 3, "food creative|", "food math", "precise creative"],
  ["fleischfachmann", "Fleischfachmann/-frau EFZ", "Professionnel/le de la viande CFC", "Butcher", 3, "food|sales", "food", "manual"],
  ["restaurant", "Restaurantfachmann/-frau EFZ", "Spécialiste en restauration CFC", "Restaurant specialist", 3, "food sales|", "languages", "social physical"],
  ["hauswirtschaft", "Fachmann/Fachfrau Hauswirtschaft EFZ", "Gestionnaire en intendance CFC", "Household management specialist", 3, "food care|office", "food", "organized caring"],
];

const words = <T extends string>(s: string) => s.split(/\s+/).filter(Boolean) as T[];

export const TRADES: Trade[] = ROWS.map(([id, de, fr, en, years, interests, skills, traits]) => {
  const [p, s = ""] = interests.split("|");
  return {
    id, name: { de, fr, en }, level: /\bEBA\b/.test(de) ? "EBA" : "EFZ", years,
    primary: words<InterestArea>(p), secondary: words<InterestArea>(s), skills: words<Skill>(skills), traits: words<Trait>(traits),
  };
});

// ─── Keyword maps (free text from the pupil profile, de/fr/en) ───────────────

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const SUBJECT_WORDS: Record<Skill, RegExp> = {
  math: /\b(mathe|mathematik|math|maths|mathematiques|rechnen)/,
  german: /\b(deutsch|german|allemand|rechtschreib|lesen|schreiben)/,
  languages: /\b(englisch|english|anglais|franzosisch|franz|french|francais|italienisch|italian|italien|fremdsprach|sprachen|langues)/,
  science: /\b(natur|nt\b|nmg|biologie|bio\b|chemie|physik|science|sciences|biology|chemistry|physics)/,
  design: /\b(bildnerisch|bg\b|zeichnen|gestalten|kunst|art\b|arts\b|dessin|drawing|design)/,
  crafts: /\b(werken|ttg|textil|handarbeit|technisches gestalten|activites creatrices|woodwork|crafts?)/,
  sport: /\b(sport|turnen|bewegung|education physique|pe\b)/,
  it: /\b(informatik|computer|medien und informatik|mi\b|it\b|programmier|coding|informatique)/,
  food: /\b(kochen|hauswirtschaft|wah\b|ernahrung|cuisine|cooking|economie familiale)/,
  spatial: /\b(raumlich|raumvorstell|vorstellungsvermogen|geometrie|spatial|geometry|geometrie)/,
  logic: /\b(logik|logisch|schlussfolger|logic|logique|reasoning)/,
  technical: /\b(technisch|technik|mechanik|technical|technique)/,
};

const TRAIT_WORDS: Record<Trait, RegExp> = {
  manual: /\b(handwerk|geschick|basteln|werken|reparier|hands?-?on|manuel|bricol|habile)/,
  precise: /\b(genau|sorgfalt|sorgfaltig|prazis|exakt|ordentlich|careful|precise|accurate|precis|soigneu|minutie)/,
  social: /\b(team|kommunikat|offen|kontaktfreud|freundlich|gesprach|kunden|sociable|communicat|outgoing|friendly)/,
  caring: /\b(hilfsbereit|geduld|einfuhl|kummer|empath|betreu|patient|caring|helpful|serviable|bienveill)/,
  creative: /\b(kreativ|fantasie|phantasie|ideen|gestalt|creative|creatif|imaginat)/,
  logic: /\b(logisch|denken|tuftel|analyt|problem|logical|logique|raisonn|knobel)/,
  organized: /\b(organis|zuverlass|punktlich|plan|selbststandig|selbstandig|reliable|organi[sz]ed|fiable|ponctuel)/,
  physical: /\b(kraft|kraftig|sportlich|ausdauer|belastbar|draussen|fit\b|physical|strong|sportif|endurance)/,
};

function skillsIn(text: string): Skill[] {
  const t = fold(text);
  return (Object.keys(SUBJECT_WORDS) as Skill[]).filter(k => SUBJECT_WORDS[k].test(t));
}

function traitsIn(text: string): Trait[] {
  const t = fold(text);
  return TRAITS.filter(k => TRAIT_WORDS[k].test(t));
}

// ─── Matching ────────────────────────────────────────────────────────────────

export type Reason =
  | { type: "wish"; title: string }
  | { type: "interest"; area: InterestArea; rating: InterestRating; primary: boolean }
  | { type: "subject"; skill: Skill }
  | { type: "test"; skill: Skill; test: string; area: string; level: "high" | "above" }
  | { type: "strength"; trait: Trait; strength: string; example: string };

export type Suggestion = {
  id: string;
  name: Trade["name"];
  level: Trade["level"];
  years: number;
  /** Trade name without EFZ/EBA and gender forms, for search links. */
  searchTerm: { de: string; fr: string };
  /** Main areas first, then side areas — for the page's area filter. */
  areas: InterestArea[];
  fit: "strong" | "good" | "possible";
  score: number;
  reasons: Reason[];
  isWish: boolean;
};

export type CareerResult = {
  suggestions: Suggestion[];
  /** Inputs that would make the ideas better (shown as hints, never as a blocker). */
  missing: ("interests" | "subjects" | "strengths" | "examples")[];
  /** How many strengths were left out because they have no example. */
  strengthsWithoutExample: number;
};

export function normalizeInterests(raw: unknown): Interests {
  if (!raw || typeof raw !== "object") return {};
  const out: Interests = {};
  for (const a of INTEREST_AREAS) {
    const v = (raw as Record<string, unknown>)[a];
    if (v === 0 || v === 1 || v === 2) out[a] = v;
  }
  return out;
}

const STRONG: TestLevel[] = ["high", "above"];

/** Strong performance-test results by skill. Stanine (personality) results never count. */
function strongTestSkills(p: SchoolProfile): { skill: Skill; test: string; area: string; level: "high" | "above" }[] {
  const out: { skill: Skill; test: string; area: string; level: "high" | "above" }[] = [];
  for (const t of p.tests ?? []) {
    if (t.scale === "stanine") continue;
    for (const r of t.results) {
      const level = testLevel(t.scale, r.score);
      if (!STRONG.includes(level)) continue;
      for (const skill of skillsIn(r.area)) {
        if (skill === "sport" || skill === "food") continue;
        out.push({ skill, test: t.name, area: r.area, level: level as "high" | "above" });
      }
    }
  }
  return out;
}

export function suggestTrades(p: SchoolProfile & { interests?: Interests }, opts: { limit?: number } = {}): CareerResult {
  const interests = normalizeInterests(p.interests);
  const favSkills = skillsIn(p.favoriteSubjects ?? "");
  const tests = strongTestSkills(p);
  const withExample = (p.strengths ?? []).filter(s => s.example && s.example.trim().length >= 3);
  const strengths = withExample.flatMap(s => traitsIn(`${s.strength} ${s.example}`).map(trait => ({ trait, strength: s.strength, example: s.example! })));
  const wishes = p.wishJobs ?? [];

  const suggestions: Suggestion[] = [];
  for (const tr of TRADES) {
    const reasons: Reason[] = [];
    let score = 0, interestHit = false;

    const wish = wishes.find(w => [tr.name.de, tr.name.fr, tr.name.en].some(n => sameTrade(w.title, n)));
    if (wish) { reasons.push({ type: "wish", title: wish.title }); score += 3; }

    for (const area of tr.primary) {
      const r = interests[area] ?? 0;
      if (r > 0) { reasons.push({ type: "interest", area, rating: r, primary: true }); score += r * 3; interestHit = true; }
    }
    for (const area of tr.secondary) {
      const r = interests[area] ?? 0;
      if (r > 0) { reasons.push({ type: "interest", area, rating: r, primary: false }); score += r * 1.5; }
    }
    // Someone who rated a main area "not for me" gets no suggestion from it (unless it is a wish job).
    if (!interestHit && !wish) continue;

    const subj = tr.skills.filter(s => favSkills.includes(s)).slice(0, 2);
    for (const s of subj) { reasons.push({ type: "subject", skill: s }); score += 2; }

    const seenTest = new Set<Skill>();
    for (const t of tests) {
      if (!tr.skills.includes(t.skill) || seenTest.has(t.skill) || seenTest.size >= 2) continue;
      seenTest.add(t.skill);
      reasons.push({ type: "test", ...t });
      score += t.level === "high" ? 2 : 1.5;
    }

    const seenTrait = new Set<Trait>();
    for (const s of strengths) {
      if (!tr.traits.includes(s.trait) || seenTrait.has(s.trait) || seenTrait.size >= 2) continue;
      seenTrait.add(s.trait);
      reasons.push({ type: "strength", ...s });
      score += 1.5;
    }

    suggestions.push({
      id: tr.id, name: tr.name, level: tr.level, years: tr.years, score, searchTerm: { de: tradeSearchTerm(tr.name.de), fr: tradeSearchTerm(tr.name.fr) },
      areas: [...tr.primary, ...tr.secondary],
      fit: score >= 15 ? "strong" : score >= 9 ? "good" : "possible",
      reasons, isWish: !!wish,
    });
  }

  suggestions.sort((a, b) => b.score - a.score || Number(b.isWish) - Number(a.isWish) || a.name.de.localeCompare(b.name.de));
  const limit = opts.limit ?? 10;
  // Wish jobs always stay in the list, even past the limit.
  const top = suggestions.slice(0, limit);
  for (const s of suggestions.slice(limit)) if (s.isWish) top.push(s);

  const missing: CareerResult["missing"] = [];
  if (!Object.values(interests).some(v => (v ?? 0) > 0)) missing.push("interests");
  if (!favSkills.length) missing.push("subjects");
  if (!(p.strengths ?? []).length) missing.push("strengths");
  else if (withExample.length < (p.strengths ?? []).length) missing.push("examples");

  return { suggestions: top, missing, strengthsWithoutExample: (p.strengths ?? []).length - withExample.length };
}

/** Trade name without the "EFZ"/"EBA" suffix and gender forms — for search links. */
export function tradeSearchTerm(name: string): string {
  return name.replace(/\b(EFZ|EBA|CFC|AFP)\b.*$/u, "")
    .replace(/\/[\p{L}-]{1,6}(?=[\s-]|$)/gu, "")   // gender suffixes: /in, /ne, /trice, /-frau
    .replace(/\/\S*/g, "")                        // second full form: Zimmermann/Zimmerin → Zimmermann
    .replace(/\s+/g, " ").trim();
}

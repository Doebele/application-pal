// ─── CV-Check criteria catalogue (data only) ──────────────────────────────────
// Versioned rule set modelled on VMock (as used by LHH). Source of the rule texts:
// ~/.claude/skills/cv-check/references/vmock-kriterien.md (read 2026-11-04 from
// a real VMock report: Claus' English short CV = 57 → Impact 13, Presentation 5,
// Competencies 39). VMock does not publish its weights; the weights below are the
// calibrated estimate from the cv-check skill. Change weights HERE, never inline in
// the scoring code, and bump `version` so stored results stay traceable.

export type CvCheckArea = "impact" | "presentation" | "competencies";
export type CvCheckKind = "rule" | "layout" | "llm";
type L10n = { de: string; en: string; fr: string };

export type CvCheckDef = {
  id: string;
  area: CvCheckArea;
  group: string;              // VMock group (action, specifics, language, pages, sections, format, section, competency)
  kind: CvCheckKind;          // how it is evaluated: deterministic text rule, PDF layout, or LLM judgement
  hygiene: boolean;           // VMock "*" check — all hygiene checks passing unlocks the bonus
  label: L10n;
  rule: L10n;                 // what passes, shown in the detail list
};

export const CV_CRITERIA = {
  version: "vmock-1",
  weights: {
    impact: { action: 15, specifics: 15, language: 10 },
    presentation: { pages: 4, sections: 4, format: 8, section: 4 },
    competencies: { perCompetency: 8 },
    bonus: 10,
    max: 100,
  },
  // Language deduction per finding (spelling error, filler word, pronoun/article start, repeated verb)
  languagePenalty: 0.5,
  // Page limit: ≤ fullPages → full points, = halfPages → half, more → 0
  pages: { fullPages: 2, halfPages: 3 },
  // Competency points: ≥ strong evidences → full, ≥ 1 → half
  competencyEvidence: { strong: 2 },
  // Area status thresholds (share of max)
  status: { good: 0.8, onTrack: 0.5 },
  // Page margins in PDF points (72 pt = 1 inch)
  marginsPt: { min: 36, max: 72, tolerance: 4 },
  // Each page must be filled at least this share of its usable height
  minPageFill: 0.5,

  checks: [
    // ── Impact ─────────────────────────────────────────────────
    { id: "action", area: "impact", group: "action", kind: "rule", hygiene: false,
      label: { de: "Aktionsorientiert", en: "Action oriented", fr: "Orienté action" },
      rule: { de: "Jeder Bullet beginnt mit einem starken Aktionsverb.", en: "Every bullet starts with a strong action verb.", fr: "Chaque puce commence par un verbe d'action fort." } },
    { id: "specifics", area: "impact", group: "specifics", kind: "llm", hygiene: false,
      label: { de: "Konkrete Zahlen", en: "Specifics", fr: "Précisions chiffrées" },
      rule: { de: "Jeder Bullet nennt den Umfang (Team, Projekte, Märkte, Budget) und wo möglich ein messbares Ergebnis.", en: "Every bullet quantifies scope (team, projects, markets, budget) and, where possible, a measurable outcome.", fr: "Chaque puce chiffre la portée (équipe, projets, marchés, budget) et si possible un résultat mesurable." } },
    { id: "language.fillers", area: "impact", group: "language", kind: "rule", hygiene: false,
      label: { de: "Füllwörter", en: "Filler words", fr: "Mots de remplissage" },
      rule: { de: "Keine Füllwörter wie actively, successfully, various, responsible for, helped.", en: "No filler words such as actively, successfully, various, responsible for, helped.", fr: "Pas de mots creux comme activement, avec succès, divers, responsable de." } },
    { id: "language.pronouns", area: "impact", group: "language", kind: "rule", hygiene: false,
      label: { de: "Pronomen und Artikel", en: "Pronouns and articles", fr: "Pronoms et articles" },
      rule: { de: "Kein Bullet beginnt mit Pronomen oder Artikel; keine Ich-Form in der Summary.", en: "No bullet starts with a pronoun or article; no first person in the summary.", fr: "Aucune puce ne commence par un pronom ou un article ; pas de « je » dans le résumé." } },
    { id: "language.overuse", area: "impact", group: "language", kind: "rule", hygiene: false,
      label: { de: "Wortwiederholungen", en: "Overused words", fr: "Répétitions" },
      rule: { de: "Kein Startverb kommt mehrfach vor.", en: "No opening verb is used more than once.", fr: "Aucun verbe d'ouverture n'est répété." } },
    { id: "language.spelling", area: "impact", group: "language", kind: "llm", hygiene: true,
      label: { de: "Rechtschreibung", en: "Spelling", fr: "Orthographe" },
      rule: { de: "Keine Rechtschreibfehler, keine fremdsprachigen Wörter oder Anführungszeichen, Abkürzungen ausgeschrieben.", en: "No spelling errors, no foreign words or quotation marks, abbreviations spelled out.", fr: "Pas de fautes, pas de mots ou guillemets étrangers, abréviations développées." } },

    // ── Presentation: pages + sections ─────────────────────────
    { id: "pages", area: "presentation", group: "pages", kind: "layout", hygiene: true,
      label: { de: "Seitenzahl", en: "Number of pages", fr: "Nombre de pages" },
      rule: { de: "Höchstens 2 Seiten (3 Seiten geben halbe Punkte).", en: "At most 2 pages (3 pages earn half the points).", fr: "2 pages maximum (3 pages = moitié des points)." } },
    { id: "sections", area: "presentation", group: "sections", kind: "rule", hygiene: true,
      label: { de: "Pflichtabschnitte", en: "Essential sections", fr: "Sections essentielles" },
      rule: { de: "Summary, Berufserfahrung mit Bullets, Ausbildung und Skills sind vorhanden.", en: "Summary, experience with bullets, education and skills are present.", fr: "Résumé, expérience avec puces, formation et compétences sont présents." } },

    // ── Presentation: overall format (9) ───────────────────────
    { id: "format.colour", area: "presentation", group: "format", kind: "layout", hygiene: true,
      label: { de: "Farbe", en: "Colour check", fr: "Couleur" },
      rule: { de: "Aller Text schwarz, nur E-Mail und LinkedIn dürfen blau sein.", en: "All text black; only email and LinkedIn may be blue.", fr: "Tout le texte en noir ; seuls e-mail et LinkedIn peuvent être bleus." } },
    { id: "format.dates", area: "presentation", group: "format", kind: "layout", hygiene: true,
      label: { de: "Datumsformat", en: "Date formatting", fr: "Format des dates" },
      rule: { de: "Daten fett, nicht kursiv, einheitliches Format, umgekehrt chronologisch, einheitliche Striche mit Leerzeichen.", en: "Dates bold, not italic, one format, reverse chronological, consistent dashes with spaces.", fr: "Dates en gras, sans italique, format unique, ordre antichronologique, tirets cohérents." } },
    { id: "format.headingSize", area: "presentation", group: "format", kind: "layout", hygiene: true,
      label: { de: "Schriftgrösse Überschriften", en: "Font size check", fr: "Taille des titres" },
      rule: { de: "Alle Abschnittsüberschriften haben dieselbe Schriftgrösse.", en: "All section headings use the same font size.", fr: "Tous les titres de section ont la même taille." } },
    { id: "format.margins", area: "presentation", group: "format", kind: "layout", hygiene: true,
      label: { de: "Seitenränder", en: "Page margins", fr: "Marges" },
      rule: { de: "Ränder zwischen 0,5 und 1 Zoll (1,27–2,54 cm).", en: "Margins between 0.5 and 1 inch.", fr: "Marges entre 1,27 et 2,54 cm." } },
    { id: "format.length", area: "presentation", group: "format", kind: "layout", hygiene: true,
      label: { de: "Seitenfüllung", en: "CV length", fr: "Remplissage des pages" },
      rule: { de: "Jede Seite ist mindestens zur Hälfte gefüllt.", en: "Every page is at least half full.", fr: "Chaque page est remplie au moins à moitié." } },
    { id: "format.headingStyle", area: "presentation", group: "format", kind: "layout", hygiene: true,
      label: { de: "Stil der Überschriften", en: "Section styling", fr: "Style des titres" },
      rule: { de: "Überschriften fett, nicht kursiv, einheitlich CAPS oder Title Case, gleich ausgerichtet.", en: "Headings bold, not italic, consistently CAPS or Title Case, aligned the same.", fr: "Titres en gras, sans italique, casse cohérente, même alignement." } },
    { id: "format.headingSpacing", area: "presentation", group: "format", kind: "layout", hygiene: true,
      label: { de: "Abstände der Überschriften", en: "Section spacing", fr: "Espacement des titres" },
      rule: { de: "Gleicher Abstand vor und nach jeder Abschnittsüberschrift.", en: "Same spacing before and after every section heading.", fr: "Même espacement avant et après chaque titre." } },
    { id: "format.bullets", area: "presentation", group: "format", kind: "rule", hygiene: true,
      label: { de: "Bullet-Zeichensetzung", en: "Bullet check", fr: "Ponctuation des puces" },
      rule: { de: "Bullets eines Abschnitts einheitlich mit oder ohne Schlusspunkt.", en: "Bullets within a section consistently with or without a full stop.", fr: "Puces d'une section toutes avec ou sans point final." } },
    { id: "format.images", area: "presentation", group: "format", kind: "layout", hygiene: true,
      label: { de: "Bilder und Logos", en: "Image check", fr: "Images et logos" },
      rule: { de: "Keine Logos, Fotos oder Icons.", en: "No logos, photos or icons.", fr: "Pas de logos, photos ou icônes." } },

    // ── Presentation: section specific (7) ─────────────────────
    { id: "section.name", area: "presentation", group: "section", kind: "layout", hygiene: true,
      label: { de: "Name", en: "Name check", fr: "Nom" },
      rule: { de: "Name fett, nicht kursiv, CAPS oder Title Case.", en: "Name bold, not italic, CAPS or Title Case.", fr: "Nom en gras, sans italique, majuscules ou casse titre." } },
    { id: "section.nameSize", area: "presentation", group: "section", kind: "layout", hygiene: true,
      label: { de: "Schriftgrösse Name", en: "Font size (name)", fr: "Taille du nom" },
      rule: { de: "Der Name ist grösser als jeder andere Text.", en: "The name is larger than any other text.", fr: "Le nom est plus grand que tout autre texte." } },
    { id: "section.phone", area: "presentation", group: "section", kind: "rule", hygiene: true,
      label: { de: "Telefonnummer", en: "Phone number", fr: "Téléphone" },
      rule: { de: "Genau eine Telefonnummer (inkl. Kopfzeile).", en: "Exactly one phone number (header included).", fr: "Un seul numéro (en-tête compris)." } },
    { id: "section.email", area: "presentation", group: "section", kind: "rule", hygiene: true,
      label: { de: "E-Mail-Adresse", en: "Email address", fr: "Adresse e-mail" },
      rule: { de: "Genau eine E-Mail-Adresse (inkl. Kopfzeile).", en: "Exactly one email address (header included).", fr: "Une seule adresse e-mail (en-tête compris)." } },
    { id: "section.degree", area: "presentation", group: "section", kind: "layout", hygiene: false,
      label: { de: "Stil Abschlüsse", en: "Degree styling", fr: "Style des diplômes" },
      rule: { de: "Abschlüsse einheitlich gestylt, nicht kursiv.", en: "Degrees styled consistently, not italic.", fr: "Diplômes au style cohérent, sans italique." } },
    { id: "section.university", area: "presentation", group: "section", kind: "layout", hygiene: false,
      label: { de: "Stil Hochschulen", en: "University styling", fr: "Style des établissements" },
      rule: { de: "Hochschulen einheitlich gestylt, nicht kursiv.", en: "Institutions styled consistently, not italic.", fr: "Établissements au style cohérent, sans italique." } },
    { id: "section.jobTitle", area: "presentation", group: "section", kind: "layout", hygiene: true,
      label: { de: "Stil Jobtitel", en: "Job title styling", fr: "Style des intitulés" },
      rule: { de: "Jobtitel einheitlich gestylt, nicht kursiv.", en: "Job titles styled consistently, not italic.", fr: "Intitulés de poste au style cohérent, sans italique." } },

    // ── Competencies (5) ───────────────────────────────────────
    { id: "competency.leadership", area: "competencies", group: "competency", kind: "llm", hygiene: false,
      label: { de: "Leadership", en: "Leadership", fr: "Leadership" },
      rule: { de: "Teams, Projekte oder Arbeitsbereiche geführt (led, managed, mentored, Teamgrösse).", en: "Led teams, projects or scopes of work (led, managed, mentored, team size).", fr: "A dirigé équipes, projets ou périmètres (dirigé, encadré, taille d'équipe)." } },
    { id: "competency.initiative", area: "competencies", group: "competency", kind: "llm", hygiene: false,
      label: { de: "Initiative", en: "Initiative", fr: "Initiative" },
      rule: { de: "Neues angestossen, eingeführt, aufgebaut (initiated, introduced, launched).", en: "Started, introduced or built something new (initiated, introduced, launched).", fr: "A lancé, introduit ou créé quelque chose de nouveau." } },
    { id: "competency.analytical", area: "competencies", group: "competency", kind: "llm", hygiene: false,
      label: { de: "Analytisches Denken", en: "Analytical aptitude", fr: "Esprit analytique" },
      rule: { de: "Analysiert, evaluiert, erforscht (User Research, Daten, Priorisierung).", en: "Analysed, evaluated, researched (user research, data, prioritisation).", fr: "A analysé, évalué, étudié (recherche utilisateur, données)." } },
    { id: "competency.communication", area: "competencies", group: "competency", kind: "llm", hygiene: false,
      label: { de: "Kommunikation", en: "Communication", fr: "Communication" },
      rule: { de: "Präsentiert, moderiert, geschult, verhandelt (Workshops, Roadshows).", en: "Presented, facilitated, trained, negotiated (workshops, roadshows).", fr: "A présenté, animé, formé, négocié (ateliers)." } },
    { id: "competency.teamwork", area: "competencies", group: "competency", kind: "llm", hygiene: false,
      label: { de: "Teamarbeit", en: "Team effort", fr: "Travail d'équipe" },
      rule: { de: "Mit anderen zusammengearbeitet (collaborated, partnered, cross-functional, international).", en: "Worked with others (collaborated, partnered, cross-functional, international).", fr: "A collaboré (transverse, international)." } },
  ] satisfies CvCheckDef[],

  // ── Word lists (lower case) ──────────────────────────────────
  // Strong action verbs. The rule check matches the bullet's first word against these
  // (all common inflections listed); unknown first words are left to the LLM judgement.
  strongVerbs: {
    en: `accelerated achieved acquired adapted addressed administered advised advocated aligned analysed analyzed anticipated applied appointed architected arranged assembled assessed audited authored automated balanced benchmarked boosted briefed budgeted built calculated campaigned captured catalogued centralised centralized championed chaired clarified coached co-created co-founded collaborated combined commissioned communicated compiled completed composed conceived conceptualised conceptualized conducted consolidated constructed consulted contributed controlled converted convinced coordinated co-led corrected crafted created cultivated curated cut debugged decreased defined delegated delivered demonstrated deployed derived designed detected determined developed devised diagnosed digitised digitized directed discovered dispatched documented doubled drafted drove earned edited educated elevated eliminated embedded empowered enabled encouraged engaged engineered enhanced ensured established estimated evaluated evolved examined exceeded executed expanded expedited experimented explored extended extracted facilitated fixed forecast forged formalised formalized formed formulated fostered founded framed gained gathered generated grew guided halved harmonised harmonized headed hired identified illustrated implemented improved increased influenced informed initiated innovated inspired installed instituted integrated interviewed introduced invented investigated launched lead led leveraged lifted localised localized maintained managed mapped marketed maximised maximized measured mediated mentored merged migrated minimised minimized mobilised mobilized modelled modeled moderated modernised modernized monitored motivated moved navigated negotiated onboarded operated optimised optimized orchestrated organised organized originated outlined overhauled oversaw partnered performed persuaded piloted pioneered planned positioned presented prioritised prioritized produced programmed promoted proposed prototyped proved provided published quantified raised ran rebuilt recommended reconciled recruited redesigned reduced re-engineered refined reframed regulated reinforced rejuvenated released remodelled renewed reorganised reorganized replaced reported represented researched resolved restructured revamped reviewed revised revitalised revitalized rolled saved scaled scheduled scoped secured selected shaped shipped showcased simplified sketched solved sourced spearheaded specified sponsored standardised standardized started steered streamlined strengthened structured succeeded summarised summarized supervised supported surpassed surveyed sustained synthesised synthesized systematised systematized tailored targeted taught tested trained transformed translated trimmed tripled troubleshot turned uncovered unified united updated upgraded validated verified visualised visualized won wrote
      accelerate achieve advise align analyse analyze architect build champion coach collaborate conceive conduct coordinate create define deliver design develop direct drive enable engage establish evaluate facilitate guide head implement improve increase initiate introduce launch lead leverage manage mentor moderate optimise optimize orchestrate oversee partner pilot pioneer plan present prioritise prioritize produce prototype redesign reduce research run scale shape spearhead steer streamline structure supervise support train transform`,
    de: `analysierte analysiert aufgebaut baute begleitete begleitet beriet beraten betreute betreut bewertete bewertet coachte gecoacht definierte definiert digitalisierte digitalisiert durchgeführt führte geführt eingeführt führte etablierte etabliert entwarf entworfen entwickelte entwickelt erarbeitete erarbeitet erhöhte erhöht erstellte erstellt gestaltete gestaltet gegründet gründete harmonisierte harmonisiert implementierte implementiert initiierte initiiert koordinierte koordiniert konzipierte konzipiert lancierte lanciert leitete geleitet moderierte moderiert optimierte optimiert organisierte organisiert plante geplant präsentierte präsentiert priorisierte priorisiert prototypisierte realisierte realisiert reduzierte reduziert schulte geschult senkte gesenkt skalierte skaliert steigerte gesteigert steuerte gesteuert strukturierte strukturiert trainierte trainiert umgesetzt setzte verantwortete verantwortet verbesserte verbessert vereinfachte vereinfacht verhandelte verhandelt vermittelte vermittelt
      analysiere baue berate betreue coache definiere entwickle erarbeite etabliere führe gestalte initiiere koordiniere konzipiere leite moderiere optimiere plane präsentiere schule skaliere steuere verantworte verbessere`,
    fr: `accompagné analysé animé amélioré bâti coordonné conçu conduit créé défini déployé développé dirigé élaboré encadré établi formé géré harmonisé implémenté initié introduit lancé mené mis modéré négocié optimisé organisé piloté planifié présenté priorisé prototypé réalisé réduit restructuré simplifié structuré supervisé transformé
      accompagne analyse anime améliore conçois coordonne crée définis développe dirige encadre gère lance mène pilote structure supervise`,
  } as Record<"de" | "en" | "fr", string>,

  // Openers that make a bullet weak even when no verb list is available
  weakOpeners: {
    en: "responsible duties experience project projects involved worked helped assisted participated tasked serving served various several",
    de: "verantwortlich zuständig mitarbeit mitwirkung unterstützung beteiligt aufgaben erfahrung projekt projekte tätigkeit diverse verschiedene",
    fr: "responsable chargé participation contribution aide missions expérience projet projets divers diverses",
  } as Record<"de" | "en" | "fr", string>,

  fillers: {
    en: ["actively", "successfully", "various", "several", "etc", "responsible for", "duties included", "helped", "worked on", "assisted with", "in charge of", "hardworking", "team player", "results-driven", "go-getter", "synergy", "dynamic"],
    de: ["erfolgreich", "aktiv", "diverse", "verschiedene", "usw", "etc", "verantwortlich für", "zuständig für", "mitgewirkt", "unterstützt bei", "teamplayer", "dynamisch", "engagiert", "zielorientiert"],
    fr: ["activement", "avec succès", "divers", "diverses", "plusieurs", "etc", "responsable de", "chargé de", "participé à", "dynamique", "esprit d'équipe"],
  } as Record<"de" | "en" | "fr", string[]>,

  // Bullet must not start with these
  pronounsArticles: {
    en: ["i", "my", "me", "we", "our", "a", "an", "the"],
    de: ["ich", "mein", "meine", "wir", "unser", "unsere", "der", "die", "das", "ein", "eine"],
    fr: ["je", "j'", "mon", "ma", "mes", "nous", "le", "la", "les", "un", "une", "l'"],
  } as Record<"de" | "en" | "fr", string[]>,

  // First-person markers in the summary
  firstPerson: {
    en: ["i", "i'm", "i've", "my", "me"],
    de: ["ich", "mein", "meine", "meinen", "meiner", "mir", "mich"],
    fr: ["je", "j'ai", "mon", "ma", "mes", "moi"],
  } as Record<"de" | "en" | "fr", string[]>,
} as const;

export type CvCriteria = typeof CV_CRITERIA;
export const checkDef = (id: string): CvCheckDef => {
  const d = (CV_CRITERIA.checks as readonly CvCheckDef[]).find(c => c.id === id);
  if (!d) throw new Error(`Unknown CV check: ${id}`);
  return d;
};

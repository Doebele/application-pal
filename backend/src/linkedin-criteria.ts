// ─── LinkedIn-Check criteria catalogue (data only) ────────────────────────────
// Source: ~/.claude/skills/linkedin-check/references/kriterien.md (Stand 11/2026).
// 100 points = A First impression 25 + B Content 35 + C Evidence 20 + D Activity 20,
// plus 8 separate "AI visibility" checkpoints that never count towards the total.
// Change weights HERE and bump `version`, never inline in linkedin-rules.ts.
//
// `kind` says how a checkpoint is rated:
//   rule — deterministic from the imported profile
//   self — from the user's self-report (things no import delivers: photo, banner, Featured …)
//   llm  — judged by the local model (Phase 2); until then "not rated"
// A checkpoint without input is "not rated": it leaves the maximum and the total is
// scaled up from the rated points (never guessed).

export type LiArea = "firstImpression" | "content" | "evidence" | "activity";
export type LiKind = "rule" | "self" | "llm";
export type LiEffort = "minutes" | "hours" | "weeks";
type L10n = { de: string; en: string; fr: string };

export type LiGroupDef = { id: string; area: LiArea | "ai"; effort: LiEffort; label: L10n };
export type LiCheckDef = { id: string; group: string; kind: LiKind; max: number; label: L10n; rule: L10n };

const g = (id: string, area: LiGroupDef["area"], effort: LiEffort, de: string, en: string, fr: string): LiGroupDef =>
  ({ id, area, effort, label: { de, en, fr } });
const c = (id: string, group: string, kind: LiKind, max: number, label: [string, string, string], rule: [string, string, string]): LiCheckDef =>
  ({ id, group, kind, max, label: { de: label[0], en: label[1], fr: label[2] }, rule: { de: rule[0], en: rule[1], fr: rule[2] } });

export const LI_CRITERIA = {
  version: "li-1",
  areaMax: { firstImpression: 25, content: 35, evidence: 20, activity: 20 } as Record<LiArea, number>,
  aiMax: 8,
  target: 80,
  status: { good: 0.8, onTrack: 0.5 },

  groups: [
    g("photo", "firstImpression", "minutes", "Profilbild", "Profile photo", "Photo de profil"),
    g("banner", "firstImpression", "hours", "Banner", "Banner", "Bannière"),
    g("headline", "firstImpression", "minutes", "Headline", "Headline", "Titre"),
    g("basics", "firstImpression", "minutes", "URL, Standort, Kontakt", "URL, location, contact", "URL, lieu, contact"),
    g("about", "content", "hours", "Info", "About", "Infos"),
    g("experience", "content", "hours", "Berufserfahrung", "Experience", "Expérience"),
    g("featured", "content", "hours", "Im Fokus", "Featured", "Sélection"),
    g("extras", "content", "hours", "Projekte, Ausbildung, Zertifikate", "Projects, education, certifications", "Projets, formation, certifications"),
    g("skills", "evidence", "minutes", "Kenntnisse", "Skills", "Compétences"),
    g("recommendations", "evidence", "weeks", "Empfehlungen", "Recommendations", "Recommandations"),
    g("honors", "evidence", "minutes", "Auszeichnungen, Publikationen, Sprachen", "Honors, publications, languages", "Distinctions, publications, langues"),
    g("posts", "activity", "weeks", "Beiträge und Artikel", "Posts and articles", "Publications et articles"),
    g("comments", "activity", "weeks", "Kommentare und Austausch", "Comments and exchange", "Commentaires et échanges"),
    g("network", "activity", "weeks", "Netzwerk und Gruppen", "Network and groups", "Réseau et groupes"),
    g("ai", "ai", "hours", "KI-Sichtbarkeit", "AI visibility", "Visibilité IA"),
  ],

  checks: [
    // ── A First impression (25) ───────────────────────────────
    c("photo", "photo", "self", 5, ["Profilbild", "Profile photo", "Photo de profil"],
      ["5: aktuell, professionell, Gesicht gross, ruhiger Hintergrund · 3: ordentlich, aber alt/klein/Freizeit · 0: fehlt, Logo, Gruppenbild.",
       "5: current, professional, face large, calm background · 3: decent but old/small/casual · 0: missing, logo, group photo.",
       "5 : récente, professionnelle, visage bien visible, fond calme · 3 : correcte mais ancienne/petite · 0 : absente, logo, photo de groupe."]),
    c("banner", "banner", "self", 5, ["Banner", "Banner", "Bannière"],
      ["5: eigenes Motiv, das die Positionierung zeigt, mobil lesbar · 3: eigenes Bild ohne Aussage · 0: LinkedIn-Standard.",
       "5: own image showing your positioning, readable on mobile · 3: own image without message · 0: LinkedIn default.",
       "5 : visuel propre qui montre le positionnement · 3 : image sans message · 0 : bannière par défaut."]),
    c("headline.role", "headline", "llm", 2, ["Zielrolle vorne", "Target role first", "Rôle cible en tête"],
      ["Zielrolle oder Kernidentität in den ersten 60 Zeichen (mobil sichtbar).", "Target role or core identity within the first 60 characters (visible on mobile).", "Rôle cible ou identité clé dans les 60 premiers caractères."]),
    c("headline.niche", "headline", "llm", 2, ["Spezialisierung", "Specialisation", "Spécialisation"],
      ["Eine Spezialisierung, die nicht jeder hat (Domäne, Methode, Branche).", "A specialisation not everyone has (domain, method, industry).", "Une spécialisation distinctive (domaine, méthode, secteur)."]),
    c("headline.proof", "headline", "llm", 2, ["Nutzen oder Beleg", "Benefit or proof", "Bénéfice ou preuve"],
      ["Für wen, welches Problem, ein Name oder eine Zahl.", "For whom, which problem, a name or a number.", "Pour qui, quel problème, un nom ou un chiffre."]),
    c("headline.keywords", "headline", "rule", 2, ["Suchbegriffe", "Search terms", "Mots-clés"],
      ["Die Zielrolle steht im Wortlaut von Stellenanzeigen in der Headline.", "The target role appears in the headline as job ads phrase it.", "Le rôle cible figure dans le titre, formulé comme dans les annonces."]),
    c("headline.clean", "headline", "rule", 2, ["Ohne Floskeln", "No buzzwords", "Sans formules creuses"],
      ["Keine Floskeln, höchstens 4 Teile mit Trennzeichen, nicht nur „Jobtitel bei Firma“.", "No buzzwords, at most 4 separated parts, not just “Title at Company”.", "Pas de formules creuses, 4 segments max., pas seulement « Poste chez Entreprise »."]),
    c("basics.url", "basics", "rule", 1, ["Eigene URL", "Custom URL", "URL personnalisée"],
      ["linkedin.com/in/vorname-nachname ohne Zahlenanhang.", "linkedin.com/in/first-last without a number suffix.", "linkedin.com/in/prenom-nom sans suffixe numérique."]),
    c("basics.location", "basics", "rule", 1, ["Standort", "Location", "Lieu"],
      ["Standort als Stadt oder Region, passend zum Zielmarkt.", "Location as city or region matching the target market.", "Lieu (ville ou région) adapté au marché cible."]),
    c("basics.website", "basics", "rule", 1, ["Website in Kontaktinfo", "Website in contact info", "Site dans les coordonnées"],
      ["Kontaktinfo enthält Website oder Portfolio.", "Contact info includes a website or portfolio.", "Les coordonnées incluent un site ou portfolio."]),
    c("basics.introLink", "basics", "self", 1, ["Link im Intro", "Link in intro", "Lien dans l'intro"],
      ["Creator-Link oder Website-Button im Intro führt zum Portfolio.", "Creator link or website button in the intro points to the portfolio.", "Lien créateur ou bouton site dans l'intro vers le portfolio."]),
    c("basics.openTo", "basics", "self", 1, ["„Offen für“ bewusst gesetzt", "“Open to” set deliberately", "« Ouvert à » choisi"],
      ["Status passend zum Ziel: „Offen für“ Jobs bzw. Dienstleistungsseite.", "Status matches the goal: “Open to” work or a services page.", "Statut adapté à l'objectif : « Ouvert à » ou page de services."]),

    // ── B Content (35) ────────────────────────────────────────
    c("about.hook", "about", "llm", 3, ["Hook am Anfang", "Opening hook", "Accroche"],
      ["Die ersten ~250 Zeichen sagen wer, für wen, was daraus wird.", "The first ~250 characters say who, for whom and what comes of it.", "Les ~250 premiers caractères disent qui, pour qui, avec quel résultat."]),
    c("about.proof", "about", "llm", 3, ["Belege", "Proof", "Preuves"],
      ["2 bis 4 konkrete Ergebnisse oder Namen (Produkte, Organisationen, Zahlen).", "2 to 4 concrete results or names (products, organisations, numbers).", "2 à 4 résultats ou noms concrets."]),
    c("about.positioning", "about", "llm", 2, ["Positionierung", "Positioning", "Positionnement"],
      ["Wofür man angefragt werden will, ist klar.", "It is clear what you want to be approached for.", "On comprend pour quoi vous contacter."]),
    c("about.structure", "about", "rule", 2, ["Struktur und Länge", "Structure and length", "Structure et longueur"],
      ["Kurze Absätze, scanbar; 1200 bis 2600 Zeichen.", "Short paragraphs, scannable; 1,200 to 2,600 characters.", "Paragraphes courts ; 1 200 à 2 600 caractères."]),
    c("about.cta", "about", "rule", 2, ["Handlungsaufforderung", "Call to action", "Appel à l'action"],
      ["Am Ende steht, worüber man sprechen kann und wie man erreichbar ist.", "It ends with what to talk about and how to get in touch.", "Se termine par un sujet d'échange et un moyen de contact."]),
    c("about.phrases", "about", "rule", 0, ["Floskeln im Info-Text", "Buzzwords in About", "Formules creuses"],
      ["Abzug 0,5 je Floskel (Beleg statt Behauptung).", "−0.5 per buzzword (proof instead of claims).", "−0,5 par formule creuse."]),
    c("exp.recent", "experience", "rule", 4, ["Aktuelle Stationen beschrieben", "Recent roles described", "Postes récents décrits"],
      ["Aktuelle und letzte Station mit 3 bis 5 Ergebnis-Sätzen oder Bullets.", "Current and previous role with 3 to 5 result sentences or bullets.", "Poste actuel et précédent avec 3 à 5 phrases de résultats."]),
    c("exp.numbers", "experience", "rule", 3, ["Zahlen und Belege", "Numbers and proof", "Chiffres et preuves"],
      ["Teamgrösse, Anzahl Produkte/Märkte/Nutzer, Auszeichnungen, Zeit/Kosten.", "Team size, number of products/markets/users, awards, time/cost.", "Taille d'équipe, produits/marchés/utilisateurs, prix, temps/coûts."]),
    c("exp.titles", "experience", "rule", 2, ["Titel konsistent", "Titles consistent", "Intitulés cohérents"],
      ["Positionstitel suchbar und konsistent mit der Headline.", "Job titles searchable and consistent with the headline.", "Intitulés recherchables et cohérents avec le titre."]),
    c("exp.older", "experience", "rule", 2, ["Ältere Stationen knapp, keine Lücken", "Older roles brief, no gaps", "Anciens postes brefs, sans trous"],
      ["Ältere Stationen in 1 bis 2 Zeilen; keine Lücken über 6 Monate ohne Erklärung.", "Older roles in 1 to 2 lines; no unexplained gaps over 6 months.", "Anciens postes en 1 à 2 lignes ; pas de trou de plus de 6 mois."]),
    c("exp.media", "experience", "self", 2, ["Medien und Kenntnisse verknüpft", "Media and skills linked", "Médias et compétences liés"],
      ["Medien, Kenntnisse oder Projekte an Positionen verknüpft.", "Media, skills or projects linked to positions.", "Médias, compétences ou projets liés aux postes."]),
    c("featured.present", "featured", "self", 2, ["Im Fokus vorhanden", "Featured present", "Sélection présente"],
      ["3 bis 6 Elemente.", "3 to 6 items.", "3 à 6 éléments."]),
    c("featured.strong", "featured", "self", 2, ["Stärkste Belege zuerst", "Strongest proof first", "Meilleures preuves en tête"],
      ["Die ersten zwei Elemente sind die stärksten Belege (Fallstudie, Portfolio, Vortrag).", "The first two items are the strongest proof (case study, portfolio, talk).", "Les deux premiers éléments sont les meilleures preuves."]),
    c("featured.quality", "featured", "self", 2, ["Vorschaubild und Titel", "Thumbnail and title", "Vignette et titre"],
      ["Jedes Element mit eigenem Vorschaubild und klarem Titel, keine toten Links, keine NDA-Inhalte.", "Every item has its own thumbnail and clear title, no dead links, no NDA content.", "Chaque élément a une vignette et un titre clair, sans lien mort ni contenu sous NDA."]),
    c("extras.projects", "extras", "rule", 2, ["Projekte", "Projects", "Projets"],
      ["Projekte-Abschnitt mit eigenen Produkten oder Fallstudien, verlinkt.", "Projects section with own products or case studies, linked.", "Section projets avec produits ou études de cas, liés."]),
    c("extras.education", "extras", "rule", 1, ["Ausbildung vollständig", "Education complete", "Formation complète"],
      ["Mindestens eine Ausbildung mit Schule und Abschluss.", "At least one education entry with school and degree.", "Au moins une formation avec école et diplôme."]),
    c("extras.certs", "extras", "rule", 1, ["Aktuelle Zertifikate", "Recent certifications", "Certifications récentes"],
      ["Zertifikat aus den letzten 3 Jahren.", "A certification from the last 3 years.", "Une certification des 3 dernières années."]),

    // ── C Evidence (20) ───────────────────────────────────────
    c("skills.count", "skills", "rule", 2, ["Anzahl Kenntnisse", "Number of skills", "Nombre de compétences"],
      ["Mindestens 30 relevante Kenntnisse (15 geben 1 Punkt).", "At least 30 relevant skills (15 earn 1 point).", "Au moins 30 compétences (15 = 1 point)."]),
    c("skills.top5", "skills", "self", 2, ["Top 5 passen zur Headline", "Top 5 match the headline", "Top 5 cohérentes"],
      ["Die 5 Top-Kenntnisse im Info-Bereich passen zur Headline.", "The 5 top skills in the About section match the headline.", "Les 5 compétences phares correspondent au titre."]),
    c("skills.linked", "skills", "self", 2, ["Kenntnisse verknüpft", "Skills linked", "Compétences liées"],
      ["Kenntnisse mit Positionen oder Projekten verknüpft.", "Skills linked to positions or projects.", "Compétences liées aux postes ou projets."]),
    c("skills.endorsed", "skills", "rule", 2, ["Bestätigungen", "Endorsements", "Validations"],
      ["Mindestens 5 Bestätigungen auf jeder der 5 meistbestätigten Kenntnisse.", "At least 5 endorsements on each of the 5 most endorsed skills.", "Au moins 5 validations sur chacune des 5 premières compétences."]),
    c("recs.count", "recommendations", "rule", 3, ["Anzahl Empfehlungen", "Number of recommendations", "Nombre de recommandations"],
      ["0 = 0 · 1–2 = 1 · 3–4 = 2 · 5+ = 3 Punkte.", "0 = 0 · 1–2 = 1 · 3–4 = 2 · 5+ = 3 points.", "0 = 0 · 1–2 = 1 · 3–4 = 2 · 5+ = 3 points."]),
    c("recs.recent", "recommendations", "rule", 2, ["Aktuelle Empfehlungen", "Recent recommendations", "Recommandations récentes"],
      ["Mindestens 2 aus den letzten 3 Jahren.", "At least 2 from the last 3 years.", "Au moins 2 des 3 dernières années."]),
    c("recs.variety", "recommendations", "rule", 2, ["Vielfalt", "Variety", "Diversité"],
      ["Von verschiedenen Rollen und Firmen (Vorgesetzte, Kollegen, Kunden, Produkt).", "From different roles and companies (managers, peers, clients, product).", "De rôles et entreprises différents."]),
    c("recs.concrete", "recommendations", "rule", 1, ["Inhaltlich konkret", "Concrete content", "Contenu concret"],
      ["Mindestens eine nennt Projekt und Wirkung, nicht nur „toller Kollege“.", "At least one names a project and its impact, not just “great colleague”.", "Au moins une cite un projet et son impact."]),
    c("honors.awards", "honors", "rule", 2, ["Auszeichnungen", "Awards", "Distinctions"],
      ["Auszeichnungen oder ausgezeichnete Produkte genannt.", "Awards or award-winning products listed.", "Distinctions ou produits primés indiqués."]),
    c("honors.publications", "honors", "rule", 1, ["Publikationen oder Vorträge", "Publications or talks", "Publications ou conférences"],
      ["Publikationen, Vorträge oder Artikel.", "Publications, talks or articles.", "Publications, conférences ou articles."]),
    c("honors.languages", "honors", "rule", 1, ["Sprachen mit Niveau", "Languages with level", "Langues avec niveau"],
      ["Sprachen mit angegebenem Niveau.", "Languages with a proficiency level.", "Langues avec niveau indiqué."]),

    // ── D Activity and network (20) ───────────────────────────
    c("posts.rhythm", "posts", "rule", 4, ["Rhythmus (90 Tage)", "Rhythm (90 days)", "Rythme (90 jours)"],
      ["Beiträge der letzten 90 Tage: 0 = 0 · 1–3 = 2 · 4–11 = 3 · 12+ = 4 Punkte.", "Posts in the last 90 days: 0 = 0 · 1–3 = 2 · 4–11 = 3 · 12+ = 4 points.", "Publications sur 90 jours : 0 = 0 · 1–3 = 2 · 4–11 = 3 · 12+ = 4 points."]),
    c("posts.topics", "posts", "llm", 3, ["Themen zur Positionierung", "Topics match positioning", "Sujets alignés"],
      ["Mindestens 2/3 der Beiträge zahlen auf die Positionierung ein.", "At least 2/3 of the posts support the positioning.", "Au moins 2/3 des publications servent le positionnement."]),
    c("posts.formats", "posts", "self", 2, ["Formate gemischt", "Mixed formats", "Formats variés"],
      ["Text, Bild/Karussell, Artikel oder Newsletter, Video.", "Text, image/carousel, article or newsletter, video.", "Texte, image/carrousel, article ou newsletter, vidéo."]),
    c("posts.own", "posts", "rule", 1, ["Eigene Inhalte", "Own content", "Contenus propres"],
      ["Mehrheitlich eigene Texte statt nur geteilter Links.", "Mostly own text rather than shared links only.", "Surtout des textes propres plutôt que des liens partagés."]),
    c("comments.regular", "comments", "rule", 2, ["Regelmässig kommentiert", "Regular comments", "Commentaires réguliers"],
      ["Substanzielle Kommentare in den letzten 90 Tagen (8+ = 2, 1+ = 1).", "Substantial comments in the last 90 days (8+ = 2, 1+ = 1).", "Commentaires substantiels sur 90 jours (8+ = 2, 1+ = 1)."]),
    c("comments.replies", "comments", "self", 2, ["Antworten unter eigenen Beiträgen", "Replies on own posts", "Réponses sous ses publications"],
      ["Antwortet auf Kommentare unter eigenen Beiträgen.", "Replies to comments on own posts.", "Répond aux commentaires sous ses publications."]),
    c("network.size", "network", "rule", 2, ["Netzwerkgrösse", "Network size", "Taille du réseau"],
      ["< 300 = 0 · 300–499 = 1 · 500+ = 2 Punkte.", "< 300 = 0 · 300–499 = 1 · 500+ = 2 points.", "< 300 = 0 · 300–499 = 1 · 500+ = 2 points."]),
    c("network.fit", "network", "self", 2, ["Netzwerk passt zur Zielgruppe", "Network fits the audience", "Réseau adapté"],
      ["Leads, Produkt, Recruiter im Zielmarkt, Fachcommunity.", "Leads, product, recruiters in the target market, professional community.", "Responsables, produit, recruteurs du marché cible."]),
    c("network.groups", "network", "rule", 2, ["Gruppen", "Groups", "Groupes"],
      ["Mitglied in 2 bis 5 passenden Gruppen (1 Gruppe = 1 Punkt); aktiv heisst: liest und schreibt.", "Member of 2 to 5 fitting groups (1 group = 1 point); active means reading and writing.", "Membre de 2 à 5 groupes (1 groupe = 1 point)."]),
  ] satisfies LiCheckDef[],

  // ── AI visibility (8 × 1, separate, not in the total) ───────
  aiChecks: [
    c("ai.entity", "ai", "rule", 1, ["Entität klar", "Clear entity", "Entité claire"],
      ["Name, Rolle und Ort eindeutig.", "Name, role and location unambiguous.", "Nom, rôle et lieu sans ambiguïté."]),
    c("ai.niche", "ai", "llm", 1, ["Nische spezifisch", "Specific niche", "Niche précise"],
      ["Nische spezifisch statt generisch.", "Niche specific rather than generic.", "Niche précise plutôt que générique."]),
    c("ai.mentions", "ai", "rule", 1, ["Erwähnungen Dritter", "Third-party mentions", "Mentions de tiers"],
      ["Auszeichnungen, Publikationen, Vorträge oder Empfehlungen vorhanden.", "Awards, publications, talks or recommendations present.", "Distinctions, publications ou recommandations présentes."]),
    c("ai.consistent", "ai", "llm", 1, ["Inhalte konsistent", "Consistent content", "Contenus cohérents"],
      ["Inhalte passen zur Positionierung.", "Content is consistent with the positioning.", "Contenus cohérents avec le positionnement."]),
    c("ai.answerable", "ai", "llm", 1, ["Direkt beantwortbar", "Directly answerable", "Réponse directe"],
      ["Ein Satz wie „X ist Design Lead für …“ lässt sich direkt zitieren.", "A sentence like “X is a design lead for …” can be quoted directly.", "Une phrase du type « X est … » peut être citée telle quelle."]),
    c("ai.recency", "ai", "rule", 1, ["Aktualität", "Recency", "Actualité"],
      ["Letzter Beitrag oder Kommentar jünger als 90 Tage.", "Last post or comment less than 90 days old.", "Dernière publication de moins de 90 jours."]),
    c("ai.nameUrl", "ai", "rule", 1, ["Name und URL stimmen", "Name and URL match", "Nom et URL concordent"],
      ["Die Profil-URL enthält den Namen.", "The profile URL contains the name.", "L'URL du profil contient le nom."]),
    c("ai.crossPlatform", "ai", "rule", 1, ["Spuren auf anderen Plattformen", "Cross-platform presence", "Présence multi-plateformes"],
      ["Website, GitHub, Behance, Dribbble, Substack o. Ä. verlinkt.", "Website, GitHub, Behance, Dribbble, Substack or similar linked.", "Site, GitHub, Behance, Dribbble, Substack ou équivalent lié."]),
  ] satisfies LiCheckDef[],

  // ── Thresholds ─────────────────────────────────────────────
  headlineMobileChars: 60,
  headlineMaxParts: 4,
  // Target length of generated headlines (LinkedIn's limit is the upper bound). Generator only, not scored.
  headlineChars: { min: 160, max: 220 },
  about: { minChars: 1200, maxChars: 2600, minParagraphs: 3, hookChars: 250, phrasePenalty: 0.5 },
  experience: { minResults: 3, gapMonths: 6, olderMaxChars: 600 },
  skills: { full: 30, half: 15, topN: 5, endorsementsPerTop: 5 },
  recommendations: { recentYears: 3, recentMin: 2, concreteMinChars: 250 },
  activityDays: 90,
  comments: { full: 8 },
  network: { half: 300, full: 500 },
  certRecentYears: 3,

  // Buzzwords (lower case; matched as whole words / phrases)
  phrases: {
    de: ["leidenschaftlich", "leidenschaftlicher", "leidenschaftliche", "passioniert", "passionierter", "ergebnisorientiert", "ergebnisorientierter",
      "zielorientiert", "zielorientierter", "teamfähig", "kommunikationsstark", "macher", "visionär", "synergien", "mehrwert schaffen",
      "ganzheitlich", "ganzheitliche", "innovativ", "innovativer", "innovative", "hands-on-mentalität", "querdenker"],
    en: ["passionate", "results-driven", "result-driven", "detail-oriented", "proven track record", "dynamic", "synergy", "synergies",
      "visionary", "thought leader", "guru", "ninja", "rockstar", "seasoned", "go-getter", "think outside the box", "rare combination"],
    fr: ["passionné", "passionnée", "orienté résultats", "orientée résultats", "dynamique", "synergie", "synergies", "visionnaire", "polyvalent", "rigoureux"],
  } as Record<"de" | "en" | "fr", string[]>,
  // "Über 20 Jahre Erfahrung …" / "With over 20 years of experience …" as the opening sentence
  yearsOpener: /^\s*(?:mit\s+)?(?:über|mehr als|seit)\s+\d+\s+jahre|^\s*(?:with\s+)?(?:over|more than)\s+\d+\s+years|^\s*(?:avec\s+)?plus de\s+\d+\s+ans/i,
  ctaHints: /kontakt|schreib|melde|sprechen|austausch|nachricht|erreich|e-?mail|@|reach out|get in touch|contact|message|let'?s talk|connect|écri|contactez|échanger|\?\s*$/i,
  platforms: /github\.com|behance\.net|dribbble\.com|substack\.com|medium\.com|gitlab\.com|figma\.com\/@|youtube\.com|speakerdeck\.com/i,
} as const;

export type LiCriteria = typeof LI_CRITERIA;
export const liCheckDef = (id: string): LiCheckDef => {
  const d = ([...LI_CRITERIA.checks, ...LI_CRITERIA.aiChecks] as LiCheckDef[]).find(x => x.id === id);
  if (!d) throw new Error(`Unknown LinkedIn check: ${id}`);
  return d;
};
export const liGroupDef = (id: string): LiGroupDef => {
  const d = (LI_CRITERIA.groups as readonly LiGroupDef[]).find(x => x.id === id);
  if (!d) throw new Error(`Unknown LinkedIn group: ${id}`);
  return d;
};

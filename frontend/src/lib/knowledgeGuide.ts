// Curated guide for the Knowledge page ("Ratgeber & Links"): official and well-known Swiss
// sources for apprenticeship search, career choice, RAV / unemployment insurance, job search and
// salary. Static data — no fetch, nothing leaves the app. Every URL was checked by hand (Nov 2026);
// berufsberatung.ch has no English pages, so English falls back to German there.
// Audience: "school" = persona schulabgaenger, "adult" = every other persona, "rav" = whoever has
// the RAV features (adults, and pupils registered with the RAV — useProfileBasics().ravEnabled).

export type GuideLang = "de" | "en" | "fr";
type Text = Record<GuideLang, string>;
export type GuideAudience = "school" | "adult" | "rav";

export type GuideLink = {
  id: string;
  title: Text;
  desc: Text;
  /** URL per language; missing languages fall back to `de`. An internal app route starts with "/". */
  url: Partial<Record<GuideLang, string>> & { de: string };
  /** Shown as the source label, e.g. "berufsberatung.ch". */
  source: string;
};

export type GuideTopic = { id: string; audience: GuideAudience; title: Text; intro: Text; links: GuideLink[] };

const BB = "https://www.berufsberatung.ch/de/";
const OR = "https://www.orientation.ch/fr/";
const AS = "https://www.arbeit.swiss/";

export const GUIDE_TOPICS: GuideTopic[] = [
  {
    id: "lehrstellen", audience: "school",
    title: { de: "Lehrstellen & Schnupperlehren finden", en: "Finding apprenticeships & taster days", fr: "Trouver une place d'apprentissage ou un stage" },
    intro: {
      de: "Die zwei grossen Börsen. Einen Link zu einer einzelnen Lehrstelle kannst du auf dem Board direkt importieren.",
      en: "The two big job boards. You can import the link to a single posting directly on the board.",
      fr: "Les deux grandes bourses. Le lien d'une offre précise peut être importé directement sur le tableau.",
    },
    links: [
      { id: "yousty", source: "yousty.ch",
        title: { de: "Yousty – Lehrstellen", en: "Yousty – apprenticeships", fr: "Yousty – places d'apprentissage" },
        desc: { de: "Grösste Lehrstellenbörse der Schweiz, mit Betriebsprofilen und Bewerbung online.", en: "Switzerland's biggest apprenticeship board, with company profiles and online applications.", fr: "La plus grande bourse d'apprentissage de Suisse, avec profils d'entreprises et candidature en ligne." },
        url: { de: "https://www.yousty.ch/de-CH/lehrstellen", fr: "https://www.yousty.ch/fr-CH/places-d-apprentissage" } },
      { id: "yousty-schnupper", source: "yousty.ch",
        title: { de: "Yousty – Schnupperlehren", en: "Yousty – taster days", fr: "Yousty – stages d'orientation" },
        desc: { de: "Schnupperplätze nach Beruf und Ort.", en: "Taster places by trade and place (German site).", fr: "Places de stage par métier et lieu (site en allemand)." },
        url: { de: "https://www.yousty.ch/de-CH/schnupperlehren" } },
      { id: "lena", source: "berufsberatung.ch",
        title: { de: "LENA – Lehrstellennachweis der Kantone", en: "LENA – the cantons' apprenticeship list", fr: "LENA – places d'apprentissage des cantons" },
        desc: { de: "Offizielle Liste der offenen Lehrstellen, gemeldet von den kantonalen Berufsbildungsämtern.", en: "Official list of open apprenticeships, reported by the cantonal VET offices.", fr: "Liste officielle des places vacantes, annoncées par les offices cantonaux de la formation professionnelle." },
        url: { de: `${BB}start-suche/lehrstellen`, fr: `${OR}accueil-recherche/apprentissages` } },
      { id: "schnupperadressen", source: "berufsberatung.ch",
        title: { de: "Schnupperadressen", en: "Taster-day addresses", fr: "Adresses pour stages d'orientation" },
        desc: { de: "Betriebe, die Schnupperlehren anbieten – auch wenn gerade keine Lehrstelle offen ist.", en: "Companies that offer taster days, even without an open apprenticeship.", fr: "Entreprises qui proposent des stages, même sans place d'apprentissage ouverte." },
        url: { de: `${BB}start-suche/schnupperadressen`, fr: `${OR}accueil-recherche/repertoire-entreprises` } },
    ],
  },
  {
    id: "berufswahl", audience: "school",
    title: { de: "Berufswahl", en: "Choosing a trade", fr: "Choix professionnel" },
    intro: {
      de: "Ideen sammeln, Berufe kennenlernen, Tests verstehen. In der App hilft dir auch die Seite „Berufswahl“.",
      en: "Collect ideas, get to know trades, understand the tests. The \"Career choice\" page in the app helps too.",
      fr: "Trouver des idées, découvrir les métiers, comprendre les tests. La page « Choix professionnel » de l'app t'aide aussi.",
    },
    links: [
      { id: "career-page", source: "Apply-Pal",
        title: { de: "Berufswahl in der App", en: "Career choice in the app", fr: "Choix professionnel dans l'app" },
        desc: { de: "Interessen ankreuzen und Ideen für Lehrberufe mit Begründung bekommen.", en: "Tick your interests and get ideas for trades, with reasons.", fr: "Coche tes intérêts et reçois des idées de métiers, avec les raisons." },
        url: { de: "/career" } },
      { id: "7-schritte", source: "berufsberatung.ch",
        title: { de: "In 7 Schritten zur Berufswahl", en: "Choosing a trade in 7 steps", fr: "Le choix professionnel en 7 étapes" },
        desc: { de: "Der offizielle Fahrplan von „Wer bin ich?“ bis zum Lehrvertrag.", en: "The official roadmap from \"who am I?\" to the contract (German).", fr: "La feuille de route officielle, de « qui suis-je ? » au contrat." },
        url: { de: `${BB}lehre-und-schule/in-7-schritten-zur-berufswahl`, fr: `${OR}apprentissage-et-ecole/choix-professionnel-en-7-etapes` } },
      { id: "berufe", source: "berufsberatung.ch",
        title: { de: "Alle Lehrberufe (EFZ / EBA)", en: "All trades (EFZ / EBA)", fr: "Tous les métiers (CFC / AFP)" },
        desc: { de: "Steckbriefe aller Lehrberufe: Tätigkeiten, Anforderungen, Dauer, Weiterbildung.", en: "Profiles of every trade: tasks, requirements, duration, further training (German).", fr: "Fiches de tous les métiers : activités, exigences, durée, perfectionnement." },
        url: { de: `${BB}start-suche/berufe-efz-eba`, fr: `${OR}accueil-recherche/professions-cfc-afp` } },
      { id: "explorer", source: "berufsberatung.ch",
        title: { de: "Berufe-Explorer", en: "Trade explorer", fr: "Berufe-Explorer (en allemand)" },
        desc: { de: "Berufe spielerisch nach Interessen entdecken.", en: "Discover trades by interest (German).", fr: "Découvrir les métiers selon ses intérêts (en allemand)." },
        url: { de: "https://www.berufsberatung.ch/de/berufe-explorer" } },
      { id: "tests", source: "berufsberatung.ch",
        title: { de: "Tests für die Berufswahl", en: "Tests for choosing a trade", fr: "Tests pour le choix professionnel" },
        desc: { de: "Was Stellwerk, Multicheck, Basic-Check & Co. messen und wer sie verlangt.", en: "What Stellwerk, Multicheck, Basic-Check & co. measure and who asks for them (German).", fr: "Ce que mesurent Stellwerk, Multicheck, Basic-Check, etc., et qui les demande." },
        url: { de: `${BB}lehre-und-schule/tests-fuer-die-berufswahl`, fr: `${OR}apprentissage-et-ecole/tests-pour-le-choix-professionnel` } },
      { id: "multicheck", source: "gateway.one",
        title: { de: "Multicheck & Basic Check", en: "Multicheck & Basic Check", fr: "Multicheck & Basic Check" },
        desc: { de: "Eignungstests, die viele Lehrbetriebe verlangen – Anmeldung und Übungsbeispiele.", en: "Aptitude tests many companies ask for — sign-up and practice examples.", fr: "Tests d'aptitude demandés par beaucoup d'entreprises — inscription et exemples." },
        url: { de: "https://www.gateway.one/de-CH/lehrstellen-bewerbung/multicheck-eignungsanalyse.html" } },
      { id: "stellwerk", source: "stellwerk.ch",
        title: { de: "Stellwerk", en: "Stellwerk", fr: "Stellwerk" },
        desc: { de: "Leistungstest in der 8. und 9. Klasse (Skala 200–800, Durchschnitt 500).", en: "School performance test in grades 8 and 9 (scale 200–800, average 500).", fr: "Test de performance en 8e et 9e (échelle 200–800, moyenne 500)." },
        url: { de: "https://stellwerk.ch" } },
      { id: "biz", source: "berufsberatung.ch",
        title: { de: "Berufsberatung (BIZ) in deinem Kanton", en: "Careers advice (BIZ) in your canton", fr: "Orientation professionnelle dans ton canton" },
        desc: { de: "Kostenlose Beratung für Jugendliche – die beste Adresse für ein persönliches Gespräch.", en: "Free advice for young people — the best place for a personal talk.", fr: "Conseil gratuit pour les jeunes — la meilleure adresse pour un entretien personnel." },
        url: { de: `${BB}die-berufs-studien-und-laufbahnberatung-der-schweiz`, fr: `${OR}lorientation-professionnelle-universitaire-et-de-carriere-en-suisse` } },
    ],
  },
  {
    id: "lehre", audience: "school",
    title: { de: "Bewerben, Lehre & Übergang", en: "Applying, apprenticeship & transition", fr: "Candidature, apprentissage & transition" },
    intro: {
      de: "Von der Bewerbung bis zur Lehre – und was es gibt, wenn es nicht sofort klappt.",
      en: "From the application to the apprenticeship — and what exists if it doesn't work out straight away.",
      fr: "De la candidature à l'apprentissage — et les solutions si ça ne marche pas tout de suite.",
    },
    links: [
      { id: "bewerbung", source: "berufsberatung.ch",
        title: { de: "Lehrstellenbewerbung", en: "Applying for an apprenticeship", fr: "Candidature pour l'apprentissage" },
        desc: { de: "Dossier, Brief, Lebenslauf, Vorstellungsgespräch – mit Beispielen.", en: "Dossier, letter, CV, interview — with examples (German).", fr: "Dossier, lettre, CV, entretien — avec exemples." },
        url: { de: `${BB}lehre-und-schule/lehrstellenbewerbung`, fr: `${OR}apprentissage-et-ecole/candidature-pour-lapprentissage` } },
      { id: "schnupperlehre", source: "berufsberatung.ch",
        title: { de: "Alles über die Schnupperlehre", en: "All about taster days", fr: "Tout sur le stage d'orientation" },
        desc: { de: "Wie du einen Platz findest, was dich erwartet und wie du dich vorbereitest.", en: "How to find a place, what to expect, how to prepare (German).", fr: "Comment trouver une place, à quoi t'attendre, comment te préparer." },
        url: { de: `${BB}lehre-und-schule/alles-ueber-die-schnupperlehre`, fr: `${OR}apprentissage-et-ecole/faire-un-stage-dorientation-en-entreprise` } },
      { id: "lehre-info", source: "berufsberatung.ch",
        title: { de: "Alles über die Lehre", en: "All about the apprenticeship", fr: "Tout sur l'apprentissage" },
        desc: { de: "Lehrvertrag, Berufsschule, Lohn, Ferien, Berufsmaturität.", en: "Contract, vocational school, pay, holidays, vocational baccalaureate (German).", fr: "Contrat, école professionnelle, salaire, vacances, maturité professionnelle." },
        url: { de: `${BB}lehre-und-schule/alles-ueber-die-lehre`, fr: `${OR}apprentissage-et-ecole/tout-sur-lapprentissage` } },
      { id: "brueckenangebote", source: "berufsberatung.ch",
        title: { de: "Brückenangebote", en: "Bridge-year programmes", fr: "Mesures de transition" },
        desc: { de: "10. Schuljahr, Vorlehre, Motivationssemester – wenn es nach der Schule noch keine Lehrstelle gibt.", en: "10th school year, pre-apprenticeship, motivation semester — if there is no place after school yet (German).", fr: "10e année, préapprentissage, semestre de motivation — s'il n'y a pas encore de place après l'école." },
        url: { de: `${BB}lehre-und-schule/brueckenangebote`, fr: `${OR}apprentissage-et-ecole/mesures-de-transition` } },
      { id: "jugendliche-rav", source: "arbeit.swiss",
        title: { de: "RAV-Unterstützung für Jugendliche", en: "RAV support for young people", fr: "Soutien de l'ORP pour les jeunes" },
        desc: { de: "Wer sich nach der Schule beim RAV meldet, bekommt Beratung und z.B. ein Motivationssemester (SEMO).", en: "Registering with the RAV after school brings advice and e.g. a motivation semester (SEMO).", fr: "S'inscrire à l'ORP après l'école donne droit à des conseils et p. ex. à un semestre de motivation (SEMO)." },
        url: { de: `${AS}de/stellensuchende/stellensuche-fuer-jugendliche`, en: `${AS}en/job-search-support-for-young-people`, fr: `${AS}fr/la-recherche-demploi-pour-les-jeunes` } },
      { id: "schwierigkeiten", source: "berufsberatung.ch",
        title: { de: "Schwierigkeiten in der Lehre", en: "Problems during the apprenticeship", fr: "Difficultés pendant l'apprentissage" },
        desc: { de: "Wohin du dich wenden kannst, wenn es im Betrieb oder in der Schule nicht gut läuft.", en: "Where to turn if things go badly at work or school (German).", fr: "À qui t'adresser si ça se passe mal en entreprise ou à l'école." },
        url: { de: `${BB}schwierigkeiten-in-der-lehre`, fr: `${OR}difficultes-pendant-lapprentissage` } },
    ],
  },
  {
    id: "rav", audience: "rav",
    title: { de: "RAV & Arbeitslosenversicherung", en: "RAV & unemployment insurance", fr: "ORP & assurance-chômage" },
    intro: {
      de: "Offizielle Informationen des SECO. Den monatlichen Nachweis der Arbeitsbemühungen erstellst du in der App über die Liste → „RAV-Report“.",
      en: "Official information from SECO. Create the monthly proof of job-search efforts in the app via List → \"RAV report\".",
      fr: "Informations officielles du SECO. La preuve mensuelle des recherches d'emploi se crée dans l'app via Liste → « Rapport RAV ».",
    },
    links: [
      { id: "rav-report", source: "Apply-Pal",
        title: { de: "RAV-Report in der App", en: "RAV report in the app", fr: "Rapport ORP dans l'app" },
        desc: { de: "Bewerbungen eines Monats als Google Sheet oder CSV im Format des Nachweisformulars.", en: "A month's applications as a Google Sheet or CSV in the format of the proof form.", fr: "Les candidatures d'un mois en Google Sheet ou CSV, au format du formulaire de preuve." },
        url: { de: "/table" } },
      { id: "erste-schritte", source: "arbeit.swiss",
        title: { de: "Erste Schritte nach der Kündigung", en: "First steps after dismissal", fr: "Premiers pas après un licenciement" },
        desc: { de: "Was du sofort tun musst – schon während der Kündigungsfrist Bewerbungen schreiben und nachweisen.", en: "What to do right away — apply and keep proof already during the notice period.", fr: "Ce qu'il faut faire tout de suite — postuler et garder des preuves dès le délai de congé." },
        url: { de: `${AS}de/stellensuchende/erste-schritte-nach-kuendigung`, en: `${AS}en/first-steps-after-dismissal`, fr: `${AS}fr/premiers-pas` } },
      { id: "anmeldung", source: "arbeit.swiss",
        title: { de: "Anmeldung beim RAV", en: "Registering with the RAV", fr: "Inscription à l'ORP" },
        desc: { de: "Wie und wann du dich anmeldest – spätestens am ersten Tag, für den du Taggeld möchtest.", en: "How and when to register — at the latest on the first day you want benefits for.", fr: "Comment et quand s'inscrire — au plus tard le premier jour pour lequel tu veux des indemnités." },
        url: { de: `${AS}de/stellensuchende/anmeldung-und-registrierung`, en: `${AS}en/signing-on-and-registration`, fr: `${AS}fr/inscription-et-enregistrement` } },
      { id: "job-room", source: "job-room.ch",
        title: { de: "Job-Room (ALV Online Services)", en: "Job-Room (ALV online services)", fr: "Job-Room (services en ligne AC)" },
        desc: { de: "Online-Anmeldung, Arbeitsbemühungen erfassen und Stellen mit Meldepflicht vor allen anderen sehen.", en: "Register online, record job-search efforts and see jobs subject to the reporting duty first.", fr: "S'inscrire en ligne, saisir ses recherches et voir en premier les postes soumis à l'obligation d'annonce." },
        url: { de: "https://www.job-room.ch" } },
      { id: "formulare", source: "arbeit.swiss",
        title: { de: "eServices & Formulare", en: "eServices & forms", fr: "eServices & formulaires" },
        desc: { de: "Nachweis der persönlichen Arbeitsbemühungen, Angaben der versicherten Person und weitere Formulare.", en: "Proof of personal job-search efforts, the insured person's details and other forms.", fr: "Preuve des recherches personnelles d'emploi, indications de la personne assurée et autres formulaires." },
        url: { de: `${AS}de/stellensuchende/eservices-und-formulare-fuer-die-arbeitslosenentschaedigung`, en: `${AS}en/eservices-and-forms-for-unemployment-benefit`, fr: `${AS}fr/eservices-et-formulaires-pour-lindemnite-de-chomage` } },
      { id: "leistungen", source: "arbeit.swiss",
        title: { de: "Taggeld & Versicherungsleistungen", en: "Daily allowance & benefits", fr: "Indemnités & prestations" },
        desc: { de: "Wer Anspruch hat, wie hoch das Taggeld ist, Zwischenverdienst und Wartetage.", en: "Who is entitled, how much, interim earnings and waiting days.", fr: "Qui y a droit, le montant, le gain intermédiaire et les jours d'attente." },
        url: { de: `${AS}de/stellensuchende/versicherungsleistungen`, en: `${AS}en/insurance-benefits`, fr: `${AS}fr/prestations` } },
      { id: "massnahmen", source: "arbeit.swiss",
        title: { de: "Kurse & arbeitsmarktliche Massnahmen", en: "Courses & labour-market measures", fr: "Cours & mesures du marché du travail" },
        desc: { de: "Kurse, Praktika, Einarbeitungszuschüsse, Motivationssemester – was das RAV bezahlen kann.", en: "Courses, work placements, training allowances, motivation semester — what the RAV can pay for.", fr: "Cours, stages, allocations d'initiation, semestre de motivation — ce que l'ORP peut financer." },
        url: { de: `${AS}de/stellensuchende/arbeitsmarktliche-massnahmen`, en: `${AS}en/labor-market-measures`, fr: `${AS}fr/mesures-relatives-au-marche-du-travail` } },
      { id: "faq", source: "arbeit.swiss",
        title: { de: "FAQ zur Arbeitslosenentschädigung", en: "FAQ on unemployment benefit", fr: "FAQ sur l'indemnité de chômage" },
        desc: { de: "Antworten auf die häufigsten Fragen, z.B. zu Ferien, Krankheit oder Kündigung durch dich selbst.", en: "Answers to the most common questions, e.g. holidays, illness or resigning yourself.", fr: "Réponses aux questions fréquentes, p. ex. vacances, maladie ou démission." },
        url: { de: `${AS}de/stellensuchende/faq-zur-arbeitslosenentschaedigung`, en: `${AS}en/faqs-on-unemployment-benefit`, fr: `${AS}fr/faq-sur-lindemnite-de-chomage` } },
      { id: "adressen", source: "arbeit.swiss",
        title: { de: "Adressen: RAV & Arbeitslosenkassen", en: "Addresses: RAV & unemployment funds", fr: "Adresses : ORP & caisses de chômage" },
        desc: { de: "Das RAV und die Arbeitslosenkasse in deinem Kanton.", en: "The RAV and unemployment fund in your canton.", fr: "L'ORP et la caisse de chômage de ton canton." },
        url: { de: `${AS}de/informationszentrum/adressen-und-links`, en: `${AS}en/addresses-and-links`, fr: `${AS}fr/adresses-et-liens` } },
    ],
  },
  {
    id: "stellensuche", audience: "adult",
    title: { de: "Stellensuche", en: "Job search", fr: "Recherche d'emploi" },
    intro: {
      de: "Stellenbörsen und Tipps. Einen Link zu einer Stelle kannst du auf dem Board direkt importieren.",
      en: "Job boards and tips. You can import the link to a posting directly on the board.",
      fr: "Bourses d'emploi et conseils. Le lien d'une offre peut être importé directement sur le tableau.",
    },
    links: [
      { id: "jobs-ch", source: "jobs.ch",
        title: { de: "jobs.ch", en: "jobs.ch", fr: "jobs.ch" },
        desc: { de: "Grösste Stellenbörse der Deutschschweiz.", en: "The biggest job board in German-speaking Switzerland.", fr: "La plus grande bourse d'emploi de Suisse alémanique." },
        url: { de: "https://www.jobs.ch/de/", en: "https://www.jobs.ch/en/", fr: "https://www.jobs.ch/fr/" } },
      { id: "jobup", source: "jobup.ch",
        title: { de: "jobup.ch", en: "jobup.ch", fr: "jobup.ch" },
        desc: { de: "Stellenbörse für die Westschweiz.", en: "Job board for French-speaking Switzerland.", fr: "Bourse d'emploi de Suisse romande." },
        url: { de: "https://www.jobup.ch/de/", en: "https://www.jobup.ch/en/", fr: "https://www.jobup.ch/fr/" } },
      { id: "linkedin-jobs", source: "linkedin.com",
        title: { de: "LinkedIn Jobs", en: "LinkedIn Jobs", fr: "LinkedIn Emplois" },
        desc: { de: "Stellen und Recruiter – lohnt sich zusammen mit einem guten Profil (LinkedIn-Check).", en: "Jobs and recruiters — worth it together with a good profile (LinkedIn-Check).", fr: "Postes et recruteurs — utile avec un bon profil (LinkedIn-Check)." },
        url: { de: "https://www.linkedin.com/jobs/" } },
      { id: "job-room-all", source: "job-room.ch",
        title: { de: "Job-Room", en: "Job-Room", fr: "Job-Room" },
        desc: { de: "Stellenportal des Bundes, auch ohne RAV-Anmeldung nutzbar.", en: "The federal job portal, usable without RAV registration.", fr: "Le portail d'emploi de la Confédération, utilisable sans inscription à l'ORP." },
        url: { de: "https://www.job-room.ch" } },
      { id: "bewerbungstipps", source: "arbeit.swiss",
        title: { de: "Bewerbungstipps", en: "Tips on applying", fr: "Conseils pour vos candidatures" },
        desc: { de: "Dossier, Lebenslauf, Vorstellungsgespräch – die Empfehlungen des SECO.", en: "Dossier, CV, interview — SECO's recommendations.", fr: "Dossier, CV, entretien — les recommandations du SECO." },
        url: { de: `${AS}de/stellensuchende/bewerbungstipps`, en: `${AS}en/tips-on-applying-for-jobs`, fr: `${AS}fr/conseils-pour-vos-candidatures` } },
      { id: "stelle-suchen", source: "berufsberatung.ch",
        title: { de: "Eine Stelle suchen", en: "Looking for a job", fr: "Rechercher un emploi" },
        desc: { de: "Wo Stellen ausgeschrieben sind, verdeckter Stellenmarkt, Spontanbewerbung.", en: "Where jobs are advertised, the hidden job market, unsolicited applications (German).", fr: "Où trouver les offres, marché caché, candidature spontanée." },
        url: { de: `${BB}jobs-und-weiterbildung/eine-stelle-suchen`, fr: `${OR}travail-et-formation-continue/rechercher-un-emploi` } },
      { id: "abschluss-erwachsene", source: "berufsberatung.ch",
        title: { de: "Berufsabschluss für Erwachsene", en: "Vocational qualification for adults", fr: "Diplôme professionnel pour adultes" },
        desc: { de: "Einen EFZ/EBA-Abschluss nachholen – Wege und Anrechnung von Erfahrung.", en: "Getting an EFZ/EBA later — routes and credit for experience (German).", fr: "Obtenir un CFC/AFP à l'âge adulte — voies et validation des acquis." },
        url: { de: `${BB}jobs-und-weiterbildung/berufsabschluss-fuer-erwachsene`, fr: `${OR}travail-et-formation-continue/obtenir-un-diplome-en-tant-quadulte` } },
    ],
  },
  {
    id: "lohn", audience: "adult",
    title: { de: "Lohn", en: "Salary", fr: "Salaire" },
    intro: {
      de: "Vergleichswerte für die Lohnverhandlung. In der App ergänzen Lohn-Check und Ackermann-Skript diese Zahlen.",
      en: "Reference values for salary talks. In the app, the salary check and the Ackermann script build on these numbers.",
      fr: "Valeurs de référence pour négocier. Dans l'app, le contrôle du salaire et le script Ackermann complètent ces chiffres.",
    },
    links: [
      { id: "salarium", source: "bfs.admin.ch",
        title: { de: "Salarium – Lohnrechner des Bundes", en: "Salarium – federal salary calculator", fr: "Salarium – calculateur de salaire de la Confédération" },
        desc: { de: "Lohnspanne nach Branche, Funktion, Region, Alter und Ausbildung (Bundesamt für Statistik).", en: "Salary range by industry, role, region, age and education (Federal Statistical Office).", fr: "Fourchette de salaire par branche, fonction, région, âge et formation (OFS)." },
        url: { de: "https://www.salarium.bfs.admin.ch/" } },
      { id: "lohnrechner", source: "lohnrechner.ch",
        title: { de: "Lohnrechner.ch", en: "Lohnrechner.ch", fr: "Lohnrechner.ch" },
        desc: { de: "Lohnrechner des Gewerkschaftsbundes, gestützt auf die Lohnstrukturerhebung.", en: "The trade-union federation's calculator, based on the wage structure survey.", fr: "Calculateur de l'Union syndicale, basé sur l'enquête sur la structure des salaires." },
        url: { de: "https://lohnrechner.ch/" } },
      { id: "lohn-vergleichen", source: "berufsberatung.ch",
        title: { de: "Lohn berechnen und vergleichen", en: "Calculating and comparing pay", fr: "Calculer et comparer son salaire" },
        desc: { de: "Überblick über Lohnrechner, Mindestlöhne und Gesamtarbeitsverträge.", en: "Overview of calculators, minimum wages and collective agreements (German).", fr: "Aperçu des calculateurs, salaires minimaux et conventions collectives." },
        url: { de: `${BB}jobs-und-weiterbildung/alles-zum-thema-lohn/lohn-berechnen-und-vergleichen`, fr: `${OR}calculer-et-comparer-son-salaire` } },
    ],
  },
];

export function guideUrl(link: GuideLink, lang: GuideLang): string {
  return link.url[lang] ?? link.url.de;
}

/** Topics for this user: school leavers see school topics, everyone else adult topics; RAV for whoever has the RAV features. */
export function topicsFor(opts: { isSchool: boolean; ravEnabled: boolean; showAll: boolean }): GuideTopic[] {
  if (opts.showAll) return GUIDE_TOPICS;
  return GUIDE_TOPICS.filter(t => t.audience === "rav" ? opts.ravEnabled : t.audience === "school" ? opts.isSchool : !opts.isSchool);
}

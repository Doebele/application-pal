// Self-check for linkedin-gen.ts — run: npx tsx backend/src/linkedin-gen.check.ts
import { parseModelJson, ModelJsonError } from "./ai-json.js";
import assert from "node:assert/strict";
import { linkedInProfileSchema } from "@application-pal/shared";
import {
  wrongLangTexts, liTranslatePrompt, draftTranslationPayload, applyDraftTranslation, emptyDraftRaw,
  normalizePositioning, normalizeIntro, normalizePositionsAnswer, normalizeSkillsAnswer, normalizeActivityAnswer,
  liHeadlineFixPrompt, liHeadlineFixInput, applyHeadlineFix, headlineLenWarnings,
  initialDraftProfile, applyDraftParts, liGenInput, liAnswersText, placeholderCount, liPositionsPrompt, liIntroPrompt,
} from "./linkedin-gen.js";
import { runLinkedInCheck, profileLang } from "./linkedin-rules.js";

const SRC = `## Lebenslauf
Design Lead, ACME Bank AG, 2021 – heute. Design System für 12 Produktteams aufgebaut. Figma, Barrierefreiheit, UX Research.
Senior UX Designer, Muster GmbH, 2016 – 2021. Portfolio: https://portfolio.example.com
Studium Interaction Design, ZHdK, 2012 – 2016.`;

// positioning: max 3, numbers guarded
const pos = normalizePositioning({ options: [{ text: "Design Lead für Banken, 40 Teams", angle: "Branche" }, { text: "" }, { text: "A" }, { text: "B" }, { text: "C" }] }, SRC);
assert.equal(pos.length, 3);
assert.equal(pos[0].text, "Design Lead für Banken, [X] Teams");

// intro: variants clamped to 220, invented numbers → [X], buzzwords warned
const intro = normalizeIntro({
  headlineVariants: [{ type: "authority", text: "Design Lead | Design System für 12 Produktteams" }, { text: "Design Lead | 30 % schneller" }, { type: "x", text: "y".repeat(300) }],
  about: "Ich bin leidenschaftlicher Design Lead.", ndaHints: ["ACME Bank AG"],
}, SRC);
assert.equal(intro.headline, "Design Lead | Design System für 12 Produktteams");
assert.equal(intro.headlineVariants[1].text, "Design Lead | [X] % schneller");
assert.equal(intro.headlineVariants[1].type, "result");
assert.equal(intro.headlineVariants[2].text.length, 220);
assert.ok(intro.warnings.some(w => w.startsWith("phrases:") && w.includes("leidenschaftlicher")));
assert.ok(intro.warnings.some(w => w.startsWith("aboutShort:")));

// model JSON: an unescaped quote inside a long text no longer loses the whole part
assert.deepEqual(parseModelJson('<think>x</think>```json\n{"a":"ok"}\n```'), { a: "ok" });
const broken = parseModelJson('{"positions":[{"ref":"p1","description":"– Launched "My Way" for EMEA\n– Led the team","skills":["Figma",]}],"ndaHints":[]}') as { positions: { description: string; skills: string[] }[] };
assert.ok(broken.positions[0].description.includes("My Way") && broken.positions[0].description.includes("Led the team"), JSON.stringify(broken));
assert.deepEqual(broken.positions[0].skills, ["Figma"]);
assert.throws(() => parseModelJson("no json here"), ModelJsonError);

// headline length: too long is clipped at a boundary, too short gets one checked pass
const part = "Design Systems and Governance";
const long = normalizeIntro({ headlineVariants: [{ type: "niche", text: Array(9).fill(part).join(" | ") }] }, SRC).headlineVariants[0].text;
assert.ok(long.length >= 160 && long.length <= 220 && long.endsWith(part), long);
const words = normalizeIntro({ headlineVariants: [{ type: "niche", text: "Design Lead ".repeat(30) }] }, SRC).headlineVariants[0].text;
assert.ok(words.length <= 220 && words.endsWith("Lead"), words);
const short = [{ type: "authority" as const, text: "Design Lead | Design Systems" }, { type: "result" as const, text: "x".repeat(170) }];
assert.ok(liHeadlineFixInput(short, "Q").includes("\"zeichen\":28") && !liHeadlineFixInput(short, "Q").includes("xxx"));
assert.ok(liHeadlineFixPrompt("en").includes("160–220"), "fix prompt names the range");
const good = "Design Lead | Design Systems | Governance across product teams and accessibility standards for complex digital products in regulated industries such as banking and insurance";
assert.equal(applyHeadlineFix(short, { headlineVariants: [{ type: "authority", text: good }] }, SRC)[0].text, good);
assert.equal(applyHeadlineFix(short, { headlineVariants: [{ type: "result", text: "y".repeat(200) }] }, SRC)[1].text, short[1].text, "a variant in range stays");
assert.equal(applyHeadlineFix(short, { headlineVariants: [{ type: "authority", text: `Passionate leader ${good}` }] }, SRC)[0].text, short[0].text, "no buzzword padding");
assert.equal(applyHeadlineFix(short, { headlineVariants: [{ type: "authority", text: "a | b | c | d | e and more text" }] }, SRC)[0].text, short[0].text, "parts limit");
assert.ok(applyHeadlineFix(short, { headlineVariants: [{ type: "authority", text: `${good} | 77 teams` }] }, SRC)[0].text.includes("[X] teams"), "new numbers become [X]");
assert.deepEqual(headlineLenWarnings(short), ["headlineShort:28"]);
assert.deepEqual(headlineLenWarnings([short[1]]), []);

// positions, rewrite: titles/companies/dates stay, descriptions guarded, matched by ref
const base = [
  { id: "p1", title: "Design Lead", company: "ACME Bank AG", location: null, description: null, start: "2021", end: null },
  { id: "p2", title: "Senior UX Designer", company: "Muster GmbH", location: null, description: "alt", start: "2016", end: "2021" },
];
const rw = normalizePositionsAnswer({ positions: [{ ref: "p2", title: "Changed", description: "– 5 Releases" }, { ref: "p1", description: "– Design System für 12 Teams" }] }, SRC,
  { positions: base, education: [], translate: false });
assert.equal(rw.positions[0].description, "– Design System für 12 Teams");
assert.equal(rw.positions[1].title, "Senior UX Designer", "title kept when not translating");
assert.equal(rw.positions[1].description, "– [X] Releases");
// translate: title may change, company stays
const tr = normalizePositionsAnswer({ positions: [{ ref: "p2", title: "Senior UX Designer (EN)", company: "Other", description: "x" }] }, SRC, { positions: base, education: [], translate: true });
assert.equal(tr.positions[1].title, "Senior UX Designer (EN)");
assert.equal(tr.positions[1].company, "Muster GmbH");
assert.equal(tr.positions[0].description, null, "unanswered position unchanged");
// build: company must be in the sources, else [X]; education from the answer
const bd = normalizePositionsAnswer({
  positions: [{ title: "Design Lead", company: "ACME Bank AG", start: "2021", end: null, description: "– x", skills: ["Figma"] }, { title: "CEO", company: "Fantasy Corp", start: "2030" }],
  education: [{ school: "ZHdK", degree: "BA Interaction Design", start: "2012", end: "2016" }],
}, SRC, { positions: [], education: [], translate: false });
assert.equal(bd.positions.length, 2);
assert.equal(bd.positions[1].company, "[X]");
assert.equal(bd.positions[1].start, "[X]");
assert.ok(bd.warnings.includes("unverified:company:Fantasy Corp"));
assert.equal(bd.education?.[0].school, "ZHdK");
assert.deepEqual(bd.positionSkills[bd.positions[0].id], ["Figma"]);

// skills: dedupe, verified only with evidence in the sources; featured URL only from sources
const sk = normalizeSkillsAnswer({
  skills: ["Figma", "figma", { name: "Kubernetes" }, { name: "Design Systems", evidence: "Design System für 12 Produktteams" }, "a very long sentence that is not a skill at all"],
  featured: [{ title: "Portfolio", url: "https://portfolio.example.com", kind: "link" }, { title: "Talk", url: "https://invented.example.org", kind: "media" }],
}, SRC);
assert.deepEqual(sk.skills, [{ name: "Figma", verified: true }, { name: "Kubernetes", verified: false }, { name: "Design Systems", verified: true }]);
assert.equal(sk.featured[0].url, "https://portfolio.example.com");
assert.equal(sk.featured[1].url, null);

// activity: groups as criteria/search terms only, plan weeks clamped
const ac = normalizeActivityAnswer({
  recommendationRequests: [{ to: "Ex-Chefin bei ACME Bank AG", text: "Hallo [Name], 99 % zufrieden?" }],
  pillars: [{ title: "Design Systems", ideas: ["Wie 12 Teams …", "50 % weniger …"] }],
  groups: { criteria: ["Fachgruppen zu Design Systems"], searchTerms: ["design systems", "accessibility"] },
  plan: [{ week: 9, tasks: ["Headline übernehmen"] }, { tasks: [] }],
}, SRC);
assert.equal(ac.recRequests[0].text, "Hallo [Name], [X] % zufrieden?");
assert.deepEqual(ac.pillars[0].ideas, ["Wie 12 Teams …", "[X] % weniger …"]);
assert.deepEqual(ac.groups?.searchTerms, ["design systems", "accessibility"]);
assert.deepEqual(ac.plan, [{ week: 4, tasks: ["Headline übernehmen"] }]);

// draft composition: new profile has honest zeros for activity/recommendations/network
const empty = initialDraftProfile(null, { sameLang: true, location: "Zürich" });
assert.equal(empty.network.connections, 0);
assert.deepEqual(empty.meta.present?.includes("RECOMMENDATIONS"), true);
const built = applyDraftParts(empty, { headline: intro.headline, summary: "x".repeat(1300), positions: bd.positions, education: bd.education, skills: sk.skills });
assert.equal(built.basics.location, "Zürich");
assert.equal(built.skills.length, 3);
const res = runLinkedInCheck({ profile: built, uiLang: "de", goal: { targetRole: "Design Lead" } });
assert.equal(res.areas.evidence.max > 0, true);
assert.equal(res.checks.find(c => c.id === "recs.count")?.status, "fail", "new profile: 0 recommendations is a real 0");
assert.equal(placeholderCount(built), 2);

// other-language base: structure kept, texts dropped
const deProfile = linkedInProfileSchema.parse({
  basics: { headline: "Design Lead für Banken und Versicherungen mit Fokus auf die Barrierefreiheit", summary: "Ich gestalte digitale Produkte, die man beim ersten Mal versteht, und baue mit den Teams die Systeme dafür auf." },
  positions: base, meta: { source: "zip", fetchedAt: "2026-11-04", present: ["PROFILE", "POSITIONS"] },
});
assert.equal(profileLang(deProfile), "de");
const enDraft = initialDraftProfile(deProfile, { sameLang: false });
assert.equal(enDraft.basics.headline, null);
assert.equal(enDraft.positions[1].description, null);
assert.equal(enDraft.positions[1].company, "Muster GmbH");
const sameDraft = initialDraftProfile(deProfile, { sameLang: true });
assert.equal(sameDraft.positions[1].description, "alt");

// second-language hint disappears once a profile in the market language exists
const fr = runLinkedInCheck({ profile: deProfile, uiLang: "de", goal: { market: "Romandie" } });
assert.ok(fr.recommendations.some(r => r.id === "secondLang"));
const fr2 = runLinkedInCheck({ profile: deProfile, uiLang: "de", goal: { market: "Romandie" }, availableLangs: ["de", "fr"] });
assert.ok(!fr2.recommendations.some(r => r.id === "secondLang"));

// input + prompts
const input = liGenInput({ profile: deProfile, profileLang: "de", positioning: "Design Lead für Banken", answers: { strengths: "Systeme", avoid: "Kunde X" }, cvText: "CV", jobAd: { role: "Lead", description: "Stelle" } });
assert.ok(input.includes("[p1]") && input.includes("Bestätigte Positionierung") && input.includes("NICHT ins Profil") && input.includes("Stellenanzeige"));
assert.equal(liAnswersText({}), "");
assert.ok(liIntroPrompt("fr").startsWith("IMPORTANT : rédige"));
assert.ok(liPositionsPrompt("en", "build").includes("Ausbildung"));

// Career starters: own prompt block, own answer labels, education notes + volunteering from a build.
assert.ok(liIntroPrompt("de", true).includes("BERUFSEINSTIEG") && !liIntroPrompt("de").includes("BERUFSEINSTIEG"));
assert.ok(liPositionsPrompt("de", "build", true).includes("\"volunteering\":[]"));
assert.ok(liAnswersText({ askedFor: "UX-Trainee" }, true).includes("Einstiegsstelle"));
assert.ok(liAnswersText({ education: "BSc Interaction Design" }).includes("Ausbildung"));
const SRC_B = "Lebenslauf: BSc Interaction Design, ZHdK 2022–2025, Abschlussarbeit über Barrierefreiheit. Ehrenamt: Pfadi Zürich, Leiterin 2019–2023.";
const beg = normalizePositionsAnswer({ positions: [], education: [{ school: "ZHdK", degree: "BSc Interaction Design", start: "2022", end: "2025", notes: "Abschlussarbeit über Barrierefreiheit." }],
  volunteering: [{ role: "Leiterin", organization: "Pfadi Zürich", start: "2019", end: "2023", description: "Gruppen geleitet" }, { role: "Helfer", organization: "Erfundener Verein" }] }, SRC_B,
  { positions: [], education: [], translate: false });
assert.equal(beg.positions.length, 0);
assert.equal(beg.education?.[0].notes, "Abschlussarbeit über Barrierefreiheit.");
assert.equal(beg.volunteering?.[0].organization, "Pfadi Zürich");
assert.equal(beg.volunteering?.[1].organization, "[X]", "organisation not in the sources");

// Language guard: the stored English positioning that came back in German
const DE_POS = "Head of Design für matrixartige Organisationen, der komplexe Nutzerbedürfnisse in klare Interaktionskonzepte zerlegt und multidisziplinäre Teams zu messbarem Business-Impact führt.";
const EN_POS = "Head of Design for matrix organisations who breaks complex user needs into clear interaction concepts and leads teams to measurable business impact.";
assert.equal(wrongLangTexts({ options: [{ text: DE_POS, angle: "Ergebnis" }] }, "en").length, 1);
assert.equal(wrongLangTexts({ options: [{ text: EN_POS, angle: "Outcome" }] }, "en").length, 0);
assert.equal(wrongLangTexts({ options: [{ text: DE_POS }] }, "de").length, 0);
// verbatim evidence from a German CV does not count against an English draft
assert.equal(wrongLangTexts({ skills: [{ name: "Figma", evidence: "Ich habe mit Figma und mit der Designsystem-Bibliothek für die Teams bei der Bank gearbeitet und das ist gut" }] }, "en").length, 0);
// short German fields together are caught
assert.equal(wrongLangTexts({ plan: [{ week: 1, tasks: ["Profil fertigstellen und die Headline mit der Zielrolle ergänzen", "Kontakte aus dem Studium mit einer Nachricht anfragen"] }] }, "en").length, 1);
assert.match(liTranslatePrompt("en"), /strictly in English/);

// Draft translation: structure kept, companies/dates untouched, no new figures, missing texts flagged
{
  const prof = linkedInProfileSchema.parse({
    basics: { headline: "Head of Design | Banking", summary: "I lead 12 designers." },
    positions: [{ id: "p1", title: "Head of Design", company: "Acme Bank", description: "– Led 12 designers", start: "2020-01", end: null }],
    meta: { source: "builder", fetchedAt: "2026-01-01T00:00:00Z" },
  });
  const raw = { ...emptyDraftRaw("en", null), positioning: "Head of Design for banks", plan: [{ week: 1, tasks: ["Finish profile", "Ask 3 people"] }] };
  const pl = draftTranslationPayload(prof, raw);
  assert.equal(pl.positions[0].ref, "p1");
  assert.equal((pl.positions[0] as Record<string, unknown>).company, undefined, "company is not sent");
  const out = applyDraftTranslation({ id: "d1", profile: prof, raw }, {
    headline: "Head of Design | Banking", about: "Ich führe 12 Designer und 40 Entwickler.",
    positions: [{ ref: "p1", title: "Leiter Design", description: "– Führte 12 Designer" }],
    plan: [{ week: 1, tasks: ["Profil fertigstellen"] }],
  }, "de", new Date("2026-02-01T00:00:00Z"));
  assert.equal(out.profile.positions[0].title, "Leiter Design");
  assert.equal(out.profile.positions[0].company, "Acme Bank");
  assert.equal(out.profile.basics.summary, "Ich führe 12 Designer und [X] Entwickler.", "no new figure");
  assert.deepEqual(out.raw.plan[0].tasks, ["Profil fertigstellen", "Ask 3 people"]);
  assert.equal(out.raw.positioning, "Head of Design for banks", "missing → source text kept");
  assert.ok(out.raw.warnings.includes("translate|untranslated:2"));
  assert.equal(out.raw.lang, "de");
  assert.deepEqual(out.raw.translatedFrom, { id: "d1", lang: "en", at: "2026-02-01T00:00:00.000Z" });
}

console.log("linkedin-gen: all assertions passed");

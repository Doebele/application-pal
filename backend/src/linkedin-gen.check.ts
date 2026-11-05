// Self-check for linkedin-gen.ts — run: npx tsx backend/src/linkedin-gen.check.ts
import assert from "node:assert/strict";
import { linkedInProfileSchema } from "@application-pal/shared";
import {
  normalizePositioning, normalizeIntro, normalizePositionsAnswer, normalizeSkillsAnswer, normalizeActivityAnswer,
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

console.log("linkedin-gen: all assertions passed");

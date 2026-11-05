// Self-check for linkedin-llm.ts (+ the rule hooks it feeds) — run: npx tsx backend/src/linkedin-llm.check.ts
import assert from "node:assert/strict";
import { normalizeLiJudgement, normalizeImportedProfile, liVerbatimWarnings, liJudgePrompt, liJudgeInput, guardNumbers } from "./linkedin-llm.js";
import { runLinkedInCheck, detectTextLang, marketLang } from "./linkedin-rules.js";

// ── judge normaliser: clamps, drops unknown/invalid, notes only on missed points ──
const j = normalizeLiJudgement({
  headline: { role: 2, niche: 5, proof: "1", notes: ["Kein Beleg"] },
  about: { hook: -1, proof: 2.6, positioning: null, notes: [] },
  posts: { topics: 3 },
  ai: { niche: 1, consistent: 0, answerable: "x" },
  cv: { titleConflicts: [{ linkedin: "Design Lead", cv: "Senior UX Designer" }, { linkedin: "UX", cv: "ux" }, { linkedin: "only" }], missingInLinkedIn: ["Designsystem für 40 Teams"] },
  headlineVariants: [{ type: "authority", text: "Design Lead | 15 Jahre Fintech" }, { text: "Design Lead | hilft Banken, [X] % schneller zu liefern" }, { type: "bogus", text: "" }],
  ndaHints: ["Bank AG"],
}, { hasCv: true });
assert.deepEqual(j.llm["headline.role"], { score: 2, findings: [] });
assert.equal(j.llm["headline.niche"].score, 2, "clamped to max");
assert.deepEqual(j.llm["headline.proof"], { score: 1, findings: ["Kein Beleg"] });
assert.equal(j.llm["about.hook"].score, 0, "negative → 0");
assert.equal(j.llm["about.proof"].score, 3, "rounded");
assert.equal(j.llm["about.positioning"], undefined, "null → not judged");
assert.equal(j.llm["ai.answerable"], undefined);
assert.equal(j.extras.cv!.titleConflicts.length, 1, "case-only difference and incomplete pairs dropped");
assert.equal(j.extras.headlineVariants.length, 2);
assert.equal(j.extras.headlineVariants[1].type, "result", "type by position when missing");
assert.deepEqual(j.extras.ndaHints, ["Bank AG"]);
// notes per point; a list goes to the first missed point only (no repeats)
const k = normalizeLiJudgement({ about: { hook: 1, proof: 1, positioning: 2, notes: { hook: "Floskel-Einstieg", proof: "Keine Ergebnisse", positioning: "ok" } } }, { hasCv: false });
assert.deepEqual(k.llm["about.hook"].findings, ["Floskel-Einstieg"]);
assert.deepEqual(k.llm["about.proof"].findings, ["Keine Ergebnisse"]);
assert.deepEqual(k.llm["about.positioning"].findings, [], "full points → no note");
const l = normalizeLiJudgement({ about: { hook: 1, proof: 1, positioning: 2, notes: ["Generisch"] } }, { hasCv: false });
assert.deepEqual(l.llm["about.hook"].findings, ["Generisch"]);
assert.deepEqual(l.llm["about.proof"].findings, []);
// figures in headline variants must come from profile/CV, else [X]
assert.equal(guardNumbers("Design Lead | 30 Teams | 15 Jahre | 1'200 Nutzer", "15 Jahre Erfahrung, 1200 Nutzer"), "Design Lead | [X] Teams | 15 Jahre | 1'200 Nutzer");
const g = normalizeLiJudgement({ headlineVariants: [{ type: "result", text: "Design Lead | Design System für 30 Teams" }] }, { hasCv: false, source: "## Headline\nDesign Lead" });
assert.equal(g.extras.headlineVariants[0].text, "Design Lead | Design System für [X] Teams");
assert.equal(normalizeLiJudgement("garbage", { hasCv: false }).extras.cv, null);
assert.deepEqual(normalizeLiJudgement(null, { hasCv: false }).llm, {});

// prompt mentions CV only when there is one; input carries goal + CV
assert.ok(liJudgePrompt("de", true).includes("titleConflicts"));
assert.ok(!liJudgePrompt("en", false).includes("titleConflicts"));

// ── import normaliser ──
const pdfText = `Alex Muster
Design Lead | Design Systems
Zürich, Schweiz
www.linkedin.com/in/alex-muster (LinkedIn)
Zusammenfassung
Ich gestalte Produkte, die man beim ersten Mal versteht.
Berufserfahrung
Bank AG
Senior Product Designer
Januar 2022 - Present (2 Jahre 10 Monate)
Page 1 of 2`;
const imp = normalizeImportedProfile({
  basics: { firstName: "Alex", lastName: "Muster", headline: "Design Lead | Design Systems", summary: "Ich gestalte Produkte, die man beim ersten Mal versteht.", location: "Zürich, Schweiz", websites: ["https://www.linkedin.com/in/alex-muster", "https://alex.design"] },
  positions: [{ title: "Senior Product Designer", company: "Bank AG", start: "Januar 2022", end: null }, { title: null, company: null }],
  skills: [{ name: "Figma" }, { name: "" }],
  connections: "500+",
  sectionsFound: ["experience", "honors"],
}, { source: "pdf", text: pdfText });
assert.equal(imp.basics.publicUrl, "www.linkedin.com/in/alex-muster", "URL from the text");
assert.deepEqual(imp.basics.websites, ["https://alex.design"], "own LinkedIn URL is not a website");
assert.equal(imp.positions.length, 1, "empty position dropped");
assert.equal(imp.skills.length, 1);
assert.equal(imp.network.connections, 500);
assert.ok(imp.meta.present!.includes("HONORS") && !imp.meta.present!.includes("SKILLS"), "PDF: fixed domain list, skills = top 3 only → not rated");
assert.deepEqual(liVerbatimWarnings(imp, pdfText), []);
const changed = { ...imp, basics: { ...imp.basics, headline: "Leidenschaftlicher Design Lead" } };
assert.equal(liVerbatimWarnings(changed, pdfText).length, 1, "rephrased headline flagged");

const txt = normalizeImportedProfile({ basics: { headline: "X" }, sectionsFound: ["languages", "skills", "nonsense"] }, { source: "text", text: "X" });
assert.deepEqual(txt.meta.present!.sort(), ["EDUCATION", "LANGUAGES", "POSITIONS", "PROFILE"]);
assert.equal(txt.network.connections, null);

// rules on an imported PDF: recommendations/activity are "na", not 0
const r = runLinkedInCheck({ profile: imp, uiLang: "de", now: new Date("2026-11-04") });
const by = (id: string) => [...r.checks, ...r.ai.checks].find(c => c.id === id)!;
assert.equal(by("recs.count").status, "na");
assert.equal(by("posts.rhythm").status, "na");
assert.equal(by("skills.count").status, "na");
assert.equal(by("network.size").score, 2);

// ── LLM + CV facts feed the rules ──
const r2 = runLinkedInCheck({ profile: imp, uiLang: "de", now: new Date("2026-11-04"), llm: j.llm, cvFacts: j.extras.cv });
assert.equal([...r2.checks].find(c => c.id === "headline.niche")!.status, "pass");
const titles = r2.checks.find(c => c.id === "exp.titles")!;
assert.equal(titles.score, 1, "CV title conflict costs a point");
assert.ok(titles.findings.some(f => f.text.includes("Senior UX Designer")));
assert.ok(r2.recommendations.some(x => x.id === "cvMissing"));
assert.ok(r2.rated.max > r.rated.max, "judged points enter the maximum");

// ── language helpers ──
assert.equal(detectTextLang("I design products that people understand. For 15 years I have led teams at banks and with agencies in the city."), "en");
assert.equal(detectTextLang("Ich gestalte Produkte, die man versteht. Seit 15 Jahren führe ich Teams bei Banken und mit Agenturen in der Stadt."), "de");
assert.equal(detectTextLang("Design Lead"), null);
assert.equal(marketLang("Schweiz (Deutschschweiz)"), "de");
assert.equal(marketLang("Zürich"), "de");
assert.equal(marketLang("Romandie"), "fr");
assert.equal(marketLang(""), null);
const en = runLinkedInCheck({ profile: { ...imp, basics: { ...imp.basics, summary: "I design products that people understand. For 15 years I have led teams at banks and with agencies in the city." } }, uiLang: "de", goal: { market: "Schweiz" } });
assert.ok(en.recommendations.some(x => x.id === "secondLang" && x.text.includes("Deutsch")), "English profile for a German-speaking market");

assert.ok(liJudgeInput(imp, { targetRole: "Design Lead", cvText: "CV-TEXT" }).includes("CV-TEXT"));
console.log("linkedin-llm: all assertions passed");

// Assert-based self-check for cv-rules.ts — run: npx tsx backend/src/cv-rules.check.ts
import assert from "node:assert/strict";
import type { CvDocument } from "@application-pal/shared";
import { runCvCheck, normalizeJudgement } from "./cv-rules.js";

const cv: CvDocument = {
  basics: { name: "Alex Muster", headline: "Product Designer", emails: ["a@example.com"], phones: ["+41 79 123 45 67"], location: "Zürich", linkedin: null, website: null, otherDetails: [], summary: "Designer with 10 years in digital products." },
  sections: [
    { id: "s1", kind: "experience", title: "Experience", items: [{
      id: "i1", title: "Lead Designer", org: "Acme", location: null, start: "2020-01", end: null, dateText: "01.2020 – Present", text: null,
      bullets: [
        { id: "b1", text: "Led a team of 6 designers across 3 products" },
        { id: "b2", text: "Responsible for the design system" },
      ],
    }] },
    { id: "s2", kind: "education", title: "Education", items: [{ id: "i2", title: "MA Design", org: "ZHdK", location: null, start: null, end: null, dateText: "2010", text: null, bullets: [] }] },
    { id: "s3", kind: "skills", title: "Skills", items: [{ id: "i3", title: null, org: null, location: null, start: null, end: null, dateText: null, text: "Figma, Research", bullets: [] }] },
  ],
} as unknown as CvDocument;

const base = runCvCheck({ cv, cvLang: "en", uiLang: "de", llm: null, layout: null });
const action = base.checks.find(c => c.id === "action")!;
assert.equal(action.status, "fail");
assert.equal(action.score, 7.5, "1 of 2 bullets starts with a strong verb");
assert.equal(base.bullets.find(b => b.id === "b2")!.action.ok, false);
assert.equal(base.checks.find(c => c.id === "pages")!.status, "na", "no layout → not checkable");
assert.equal(base.bonus.earned, false, "unverified hygiene never earns the bonus");
assert.equal(base.rawTotal, base.total);

// Waiving a bullet's opener lifts the action check to full points; total = raw + gain
const acc = runCvCheck({ cv, cvLang: "en", uiLang: "de", llm: null, layout: null, accepted: ["action:b2"] });
assert.equal(acc.checks.find(c => c.id === "action")!.score, 15);
assert.equal(acc.bullets.find(b => b.id === "b2")!.action.accepted, true);
assert.equal(acc.rawTotal, base.total);
assert.equal(acc.total, acc.rawTotal + acc.acceptedGain);
assert.ok(acc.acceptedGain >= 7, `gain ${acc.acceptedGain}`);

// Waiving a whole scored check marks it accepted with max points; waiving a pass is a no-op
const acc2 = runCvCheck({ cv, cvLang: "en", uiLang: "de", llm: null, layout: null, accepted: ["specifics", "sections"] });
assert.equal(acc2.checks.find(c => c.id === "specifics")!.status, "accepted");
assert.equal(acc2.checks.find(c => c.id === "specifics")!.score, 15);
assert.equal(acc2.checks.find(c => c.id === "sections")!.status, "pass");

// LLM normalisation: unknown ids dropped, invented quotes dropped
const j = normalizeJudgement({
  bullets: [{ id: "b2", strongVerb: false, scope: false, outcome: false, rewriteScope: "Built a design system for [X] teams" }, { id: "zzz", strongVerb: true }],
  spelling: [{ text: "teh", suggestion: "the" }, { text: "Same", suggestion: "same" }],
  competencies: { leadership: ["Led a team of 6 designers", "Managed 40 people"], teamwork: [] },
  headline: { isBranding: false, suggestion: "Lead Product Designer | Design Systems" },
}, cv);
assert.deepEqual(j.bullets.map(b => b.id), ["b2"]);
assert.equal(j.spelling.length, 1);
assert.deepEqual(j.competencies.leadership, ["Led a team of 6 designers"]);
const withLlm = runCvCheck({ cv, cvLang: "en", uiLang: "de", llm: j, layout: null });
assert.equal(withLlm.competencies.find(c => c.id === "leadership")!.score, 4, "one quote = half points");
assert.equal(withLlm.bullets.find(b => b.id === "b2")!.suggestions.scope, "Built a design system for [X] teams");

console.log("cv-rules.check: all assertions passed");

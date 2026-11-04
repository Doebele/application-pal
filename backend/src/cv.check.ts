// Self-check for cv.ts — run with: npx tsx backend/src/cv.check.ts
import assert from "node:assert/strict";
import { detectCvLang, normalizeParsedCv, verbatimWarnings, cvStats } from "./cv.js";

// Language detection from file names / tags
assert.equal(detectCvLang("CV-2026-de"), "de");
assert.equal(detectCvLang("CV-2026-en–Claus Medvesek–SMG Swiss Marketplace Group–261101.pdf"), "en");
assert.equal(detectCvLang("Lebenslauf", "Lebenslauf, englisch, 2026, cv"), "en");
assert.equal(detectCvLang("Lebenslauf Deutsch"), "de");
assert.equal(detectCvLang("Interview-Vorbereitung Vorlage"), null);

// Normalisation tolerates sloppy LLM output and assigns ids
const cv = normalizeParsedCv({
  basics: { name: "Claus Medvesek", emails: ["a@b.ch", "", 3], phones: "x" },
  sections: [
    { kind: "experience", title: "PROFESSIONAL EXPERIENCE", items: [
      { title: "Senior UX Designer", org: "UBS", dateText: "03/2021 – heute", start: "2021-03", end: "present",
        bullets: ["Led a team of up to 6 people", "Development of interface guidelines", ""] },
    ] },
    { kind: "nonsense", title: "Hobbies", items: [{ text: "Cycling" }] },
  ],
});
assert.deepEqual(cv.basics.emails, ["a@b.ch"]);
assert.deepEqual(cv.basics.phones, []);
assert.equal(cv.sections[1].kind, "other");
assert.equal(cv.sections[0].items[0].bullets.length, 2);
assert.ok(cv.sections[0].items[0].bullets.every(b => b.id.length === 10));
assert.notEqual(cv.sections[0].id, cv.sections[1].id);

// Verbatim check: quotes/dashes/bullets/whitespace differences are fine, rewrites are not
const source = `Claus Medvesek
PROFESSIONAL EXPERIENCE
Senior UX Designer  UBS   03/2021 - heute
• Led a team of
  up to 6 people
• Development of interface guidelines
Hobbies
Cycling`;
assert.deepEqual(verbatimWarnings(cv, source), []);
const rewritten = normalizeParsedCv({ ...cv, sections: [{ kind: "experience", title: "PROFESSIONAL EXPERIENCE",
  items: [{ title: "Senior UX Designer", org: "UBS", bullets: ["Led 6 designers across 4 markets"] }] }] });
const w = verbatimWarnings(rewritten, source);
assert.equal(w.length, 1);
assert.equal(w[0].path, "sections[0].items[0].bullets[0]");

const st = cvStats(cv);
assert.equal(st.positions, 1);
assert.equal(st.bullets, 2);

console.log("cv.check: all assertions passed");

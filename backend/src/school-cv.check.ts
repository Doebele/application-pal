// Assert-based self-check for school-cv.ts — run: npx tsx backend/src/school-cv.check.ts
// Fictitious data only.
import assert from "node:assert/strict";
import { buildSchoolCv, normalizeCvData, schoolCvChecks, schoolCvText, winAnsiSafe } from "./school-cv.js";
import { schoolCvPdf } from "./school-cv-pdf.js";
import { parseSchoolProfile } from "./letter-kinds.js";

const person = { name: "Lea Beispiel", email: "lea.beispiel@example.ch", phone: "079 000 00 00", location: "3000 Bern", photoUrl: "" };
const profile = {
  wishJobs: [{ title: "Schreiner/in EFZ" }],
  experiences: [
    { kind: "schnupper" as const, title: "Schreiner/in EFZ (3.–5. März 2026)", company: "Holzbau Muster AG" },
    { kind: "verein" as const, title: "Leiterin Jungschar" },
    { kind: "hobby" as const, title: "Fussball" },
  ],
  tests: [{ name: "Stellwerk 9", scale: "stellwerk" as const, results: [{ area: "Mathematik", score: 610 }] }],
  cv: {
    birthDate: "2010-04-17", nationality: "Schweiz", street: "Musterweg 1", zipCity: "3000 Bern",
    schools: [{ from: "2016", to: "2022", name: "Primarschule Muster", place: "Bern" }, { from: "2022", to: "", name: "Sekundarschule A", place: "Bern" }],
    languages: [{ name: "Deutsch", level: "native" }, { name: "Französisch", level: "good" }, { name: "Klingonisch", level: "fluent" }],
    references: [{ name: "Herr Muster", role: "Klassenlehrer", phone: "031 000 00 00" }],
    photo: "javascript:alert(1)",
  },
};

// normalize: bad photo dropped, unknown level emptied
const n = normalizeCvData(profile.cv);
assert.equal(n.photo, undefined);
assert.equal(n.languages?.[2].level, "");

// model
const m = buildSchoolCv(person, profile, "de");
assert.equal(m.title, "Lebenslauf");
assert.deepEqual(m.sections.map(x => x.id), ["school", "taster", "experience", "wish", "languages", "hobbies", "references"]);
assert.equal(m.sections[0].rows[0].what, "Sekundarschule A", "newest school first");
assert.equal(m.sections[0].rows[0].when, "2022 – heute");
assert.ok(m.personal.some(p => p.value === "17.04.2010"));
assert.ok(m.personal.some(p => p.value === "Musterweg 1, 3000 Bern"));
assert.equal(buildSchoolCv(person, profile, "en").sections[0].title, "Education");
assert.match(schoolCvText(m), /SCHNUPPERLEHREN\nSchreiner\/in EFZ/);

// checklist
const byId = (cs: ReturnType<typeof schoolCvChecks>) => Object.fromEntries(cs.map(c => [c.id, c.status]));
const c = byId(schoolCvChecks(person, profile));
assert.deepEqual(c, { photo: "warn", contact: "ok", birthDate: "ok", email: "ok", schools: "ok", taster: "ok", languages: "ok", hobbies: "ok", references: "ok", swiss: "ok", tests: "ok" });
const bad = byId(schoolCvChecks({ ...person, email: "sexy.lea69@example.ch", phone: "" },
  { experiences: [], cv: { schools: [{ from: "2014", to: "2018", name: "Primar" }, { from: "2021", name: "Sek" }], hobbies: "Strasse und Fußball" } }));
assert.equal(bad.email, "warn");
assert.equal(bad.contact, "fail");
assert.equal(bad.birthDate, "fail");
assert.equal(bad.schools, "warn", "gap 2018–2021");
assert.equal(bad.taster, "warn");
assert.equal(bad.references, "warn");
assert.equal(bad.swiss, "warn");

// the cv part survives the letter-kinds profile parser (taster upsert re-serialises it)
assert.equal(parseSchoolProfile(JSON.stringify(profile)).cv?.birthDate, "2010-04-17");

// PDF renders, also with characters the standard font lacks
assert.equal(winAnsiSafe("Ärger → Erfolg 🙂 – „gut“"), "Ärger -> Erfolg ? – „gut“");
const pdf = await schoolCvPdf(buildSchoolCv({ ...person, name: "Zoë Ünal 🙂" }, profile, "fr"), null);
assert.equal(new TextDecoder().decode(pdf.slice(0, 5)), "%PDF-");
assert.ok(pdf.length > 1500);
console.log("school-cv: model, checklist and PDF passed");

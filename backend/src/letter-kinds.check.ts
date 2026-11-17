// Assert-based self-check for letter-kinds.ts — run: npx tsx backend/src/letter-kinds.check.ts
import assert from "node:assert/strict";
import { buildSalutation, detectApplicationKind, detectApprenticeship, letterWordLimit, normalizeKind, salutationPrompt, schoolLeaverRules } from "./letter-kinds.js";

assert.equal(detectApplicationKind("Wir bieten Schnuppertage für die Lehre als Schreiner/in EFZ"), "schnupperlehre");
assert.equal(detectApplicationKind("Lehrstelle Kauffrau/Kaufmann EFZ ab August 2027"), "lehrstelle");
assert.equal(detectApplicationKind("Place d'apprentissage informaticien CFC"), "lehrstelle");
assert.equal(detectApplicationKind("Praktikum Marketing, 6 Monate"), "praktikum");
assert.equal(detectApplicationKind("Senior Product Designer (80–100%)"), null);

assert.equal(detectApprenticeship("Lehrstelle als Schreiner/in EFZ in Bern"), "Schreiner/in EFZ");
assert.equal(detectApprenticeship("Informaticien CFC"), "Informaticien CFC");
assert.equal(detectApprenticeship("Product Designer"), null);

assert.equal(buildSalutation("de", "Maria Muster", "f"), "Sehr geehrte Frau Muster");
assert.equal(buildSalutation("de", "Herr Hans Meier", "m"), "Sehr geehrter Herr Meier");
assert.equal(buildSalutation("de", "Kim Graf", "x"), "Guten Tag Kim Graf");
assert.equal(buildSalutation("de", "", null), "Sehr geehrte Damen und Herren");
assert.equal(buildSalutation("de", "Maria Muster", null), "");
assert.equal(buildSalutation("en", "Maria Muster", "f"), "Dear Ms Muster");
assert.equal(buildSalutation("fr", "Hans Meier", "m"), "Monsieur,");
assert.equal(salutationPrompt("de", "Maria Muster", null), "");
assert.match(salutationPrompt("de", null, null), /Sehr geehrte Damen und Herren/);

assert.equal(normalizeKind("lehrstelle"), "lehrstelle");
assert.equal(normalizeKind(null), "job");
assert.equal(normalizeKind("foo"), "job");
assert.equal(letterWordLimit("schnupperlehre"), 180);
assert.equal(letterWordLimit("job"), 350);
assert.equal(schoolLeaverRules("job", null), "");
assert.match(schoolLeaverRules("schnupperlehre", "Schreiner/in EFZ"), /kennenlernen/);
assert.match(schoolLeaverRules("lehrstelle", null), /bei Ihnen lernen/);

console.log("letter-kinds: all checks passed");

// ─── pupil profile ───
import { formatSchoolAnswers, formatSchoolProfile, parseSchoolProfile, sameTrade } from "./letter-kinds.js";
assert.ok(sameTrade("Schreinerin", "Schreiner/in EFZ"));
assert.ok(sameTrade("Informatiker", "Informatiker/in EFZ"));
assert.ok(!sameTrade("Koch", "Kauffrau EFZ"));
const sp = parseSchoolProfile(JSON.stringify({
  school: "Sek A, 9. Klasse",
  wishJobs: [{ title: "Koch" }, { title: "Schreinerin", why: "Holz", since: "Werkunterricht" }],
  experiences: [{ kind: "schnupper", title: "Schnupperwoche", company: "Holzbau Muster AG", liked: "Maschinen" }, { kind: "bogus", title: "Ämtli" }, { title: "" }],
  strengths: [{ strength: "Zuverlässig", example: "Zeitungen austragen" }, { strength: "Kreativ" }],
}));
assert.equal(sp.experiences?.length, 2);
assert.equal(sp.experiences?.[1].kind, "anderes");
const block = formatSchoolProfile(sp, "Schreiner/in EFZ", "Holzbau Muster");
assert.ok(block.indexOf("Schreinerin (passt") < block.indexOf("Koch"));
assert.match(block, /IN DIESEM BETRIEB/);
assert.match(block, /Kreativ → \(noch kein Beispiel/);
assert.equal(formatSchoolProfile({}, null, null), "");
assert.equal(parseSchoolProfile("not json").school, undefined);
assert.equal(formatSchoolAnswers({ whyJob: "x" }, "job"), "");
assert.match(formatSchoolAnswers({ schnupperHere: "yes", schnupperNotes: "Fenster gebaut" }, "lehrstelle"), /stärkste Argument/);
assert.doesNotMatch(formatSchoolAnswers({ schnupperHere: "yes" }, "schnupperlehre"), /geschnuppert/);
console.log("letter-kinds: pupil profile checks passed");

// ─── school tests ───
import { formatSchoolTests, guessScale, normalizeTest, testLevel } from "./letter-kinds.js";
assert.equal(guessScale("Stellwerk 8"), "stellwerk");
assert.equal(guessScale("Lernpass plus PSM"), "stanine");
assert.equal(guessScale("Multicheck Handwerk"), "percent");
assert.equal(testLevel("stellwerk", 642), "high");
assert.equal(testLevel("stellwerk", 569), "above");
assert.equal(testLevel("stellwerk", 514), "average");
assert.equal(testLevel("stanine", 8), "high");
assert.equal(testLevel("stanine", 1), "low");
const nt = normalizeTest({ name: "Stellwerk 8", results: [{ area: "Englisch", score: 642 }, { area: "Fehler", score: 1200 }, { area: "", score: 500 }] });
assert.equal(nt?.results.length, 1);
assert.equal(normalizeTest({ name: "" }), null);
const tb = formatSchoolTests([
  { name: "Stellwerk 8", date: "Frühjahr 2025", scale: "stellwerk", results: [{ area: "Englisch", score: 642 }, { area: "Französisch", score: 514 }] },
  { name: "Lernpass plus PSM", scale: "stanine", results: [{ area: "Teamorientierung", score: 8 }, { area: "Zuverlässigkeit", score: 1 }] },
]);
assert.match(tb, /Englisch: 642 Punkte — deutlich über/);
assert.doesNotMatch(tb, /Französisch/);
assert.doesNotMatch(tb, /Zuverlässigkeit/);
assert.match(tb, /Teamorientierung/);
assert.equal(formatSchoolTests([{ name: "Stellwerk 8", scale: "stellwerk", results: [{ area: "Mathe", score: 480 }] }]), "");
console.log("letter-kinds: school test checks passed");

// ─── school letter checks ───
import { schoolLetterChecks, checksForPrompt } from "./letter-kinds.js";
const good = `Sehr geehrte Frau Muster

Ich bewerbe mich um eine Lehrstelle als Schreinerin EFZ bei der Holzbau Muster AG. Auf Ihrer Website habe ich das Projekt mit dem Schulhaus aus Holz gesehen.
Im Werkunterricht habe ich ein Regal aus Massivholz gebaut. Dass am Schluss etwas Echtes dasteht, hat mir am meisten Spass gemacht.
Seit zwei Jahren trage ich jeden Mittwoch Zeitungen aus. Darauf kann man sich verlassen.
Während meiner Schnupperwoche durfte ich Fenster montieren. Die Arbeit mit den Maschinen hat mir gefallen und das Team war hilfsbereit.
Gerne zeige ich Ihnen in einem Gespräch, was ich kann.

Freundliche Grüsse
Lea Beispiel`;
const ctx = { lang: "de", kind: "lehrstelle" as const, company: "Holzbau Muster AG", contactPerson: "Maria Muster", contactGender: "f" };
const byId = (cs: ReturnType<typeof schoolLetterChecks>) => Object.fromEntries(cs.map(c => [c.id, c.status]));
const g = byId(schoolLetterChecks(good, ctx));
assert.deepEqual(g, { salutation: "ok", contact: "ok", company: "ok", length: "ok", repetition: "ok", ichStarts: "ok", phrases: "ok", opening: "ok", placeholders: "ok", closing: "ok", swiss: "ok" });
const bad = `Sehr geehrtes Herrn Muster

Hiermit bewerbe ich mich mit grossem Interesse bei Ihrem Unternehmen. Ich bin kreativ und teamfähig.
Ich mag Holz. Ich mag Holz sehr. Ich arbeite gerne mit Holz und Holz ist toll. [Beispiel ergänzen]
Ich freue mich auf eine Antwort. Grüße`;
const b = byId(schoolLetterChecks(bad, ctx));
assert.equal(b.salutation, "fail");
assert.equal(b.company, "fail");
assert.equal(b.phrases, "fail");
assert.equal(b.opening, "fail");
assert.equal(b.placeholders, "fail");
assert.equal(b.ichStarts, "warn");
assert.equal(b.repetition, "warn");
assert.equal(b.swiss, "warn");
assert.equal(b.closing, "warn");
assert.equal(b.length, "warn");
assert.match(checksForPrompt(schoolLetterChecks(bad, ctx)), /company: fail/);
assert.equal(checksForPrompt(schoolLetterChecks(good, ctx)), "");
const neutral = byId(schoolLetterChecks(good.replace("Sehr geehrte Frau Muster", "Sehr geehrte Damen und Herren"), { ...ctx, contactPerson: null, contactGender: null }));
assert.equal(neutral.salutation, "ok");
assert.equal(neutral.contact, "na");
console.log("letter-kinds: school letter checks passed");

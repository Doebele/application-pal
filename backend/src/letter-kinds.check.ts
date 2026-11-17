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

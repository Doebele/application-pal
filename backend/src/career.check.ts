// Self-check for career.ts — fictitious pupil profiles only. Run: npx tsx backend/src/career.check.ts
import assert from "node:assert/strict";
import { suggestTrades, TRADES, INTEREST_AREAS, tradeSearchTerm, normalizeInterests } from "./career.js";
import { parseSchoolProfile, type SchoolProfile } from "./letter-kinds.js";

// Catalogue sanity: unique ids, known areas, every trade reachable through a primary area.
assert.equal(new Set(TRADES.map(t => t.id)).size, TRADES.length, "unique ids");
for (const t of TRADES) {
  assert.ok(t.primary.length > 0, `${t.id} has a main area`);
  for (const a of [...t.primary, ...t.secondary]) assert.ok(INTEREST_AREAS.includes(a), `${t.id}: unknown area ${a}`);
  assert.ok(t.name.de && t.name.fr && t.name.en);
}
assert.ok(TRADES.length >= 50);
assert.equal(TRADES.find(t => t.id === "logistiker-eba")!.level, "EBA");

// Empty profile → no ideas, hints for every input.
const empty = suggestTrades({});
assert.equal(empty.suggestions.length, 0);
assert.deepEqual(empty.missing, ["interests", "subjects", "strengths"]);

// Wood and building, likes Werken and Mathe, precise with an example.
const wood: SchoolProfile = {
  interests: { build: 2, creative: 1, office: 0 },
  favoriteSubjects: "Werken (TTG) und Mathe, weil ich gerne tüftle",
  strengths: [{ strength: "Genau", example: "Ich habe ein Vogelhaus millimetergenau gebaut" }, { strength: "Geduldig" }],
  tests: [{ name: "Stellwerk 8", scale: "stellwerk", results: [{ area: "Mathematik", score: 620 }, { area: "Deutsch Lesen", score: 410 }] }],
};
const w = suggestTrades(wood);
const ids = w.suggestions.map(s => s.id);
assert.ok(ids.slice(0, 3).includes("schreiner"), `Schreiner near the top: ${ids.join(",")}`);
assert.ok(!ids.includes("kaufmann"), "office rated 0 → no Kaufmann");
const schreiner = w.suggestions.find(s => s.id === "schreiner")!;
assert.ok(schreiner.reasons.some(r => r.type === "subject" && r.skill === "crafts"));
assert.ok(schreiner.reasons.some(r => r.type === "test" && r.skill === "math" && r.level === "high"));
assert.ok(schreiner.reasons.some(r => r.type === "strength" && r.trait === "precise"));
assert.ok(!w.suggestions.some(s => s.reasons.some(r => r.type === "test" && r.skill === "german")), "weak test result never counts");
assert.ok(!w.suggestions.some(s => s.reasons.some(r => r.type === "strength" && r.strength === "Geduldig")), "strength without example never counts");
assert.equal(w.strengthsWithoutExample, 1);
assert.ok(w.missing.includes("examples"));

// Average result (Stellwerk 500) and the personality profile (stanine) never count.
const avg = suggestTrades({ interests: { lab: 2 }, tests: [
  { name: "Stellwerk 9", scale: "stellwerk", results: [{ area: "Natur und Technik", score: 500 }] },
  { name: "Lernpass plus PSM", scale: "stanine", results: [{ area: "Logisches Denken", score: 9 }] },
] });
assert.ok(avg.suggestions.length > 0);
assert.ok(avg.suggestions.every(s => !s.reasons.some(r => r.type === "test")), "average and stanine ignored");

// A wish job stays in the list even when its area is rated 0, and is marked.
const wish = suggestTrades({ interests: { it: 2, food: 0 }, wishJobs: [{ title: "Koch" }] });
const koch = wish.suggestions.find(s => s.id === "koch")!;
assert.ok(koch && koch.isWish && koch.reasons[0].type === "wish");
assert.ok(wish.suggestions[0].id.startsWith("informatiker") || wish.suggestions[0].id === "automatiker" || wish.suggestions[0].id === "elektroniker" || wish.suggestions[0].id === "interactive-media" || wish.suggestions[0].id === "mediamatiker" || wish.suggestions[0].id === "ict-fachmann");

assert.deepEqual(w.suggestions.find(s => s.id === "schreiner")!.areas, ["build", "creative", "tech"], "areas: main first, then side");

// Limit keeps wish jobs past the cut.
const many = suggestTrades({ interests: Object.fromEntries(INTEREST_AREAS.map(a => [a, 2])), wishJobs: [{ title: "Fleischfachmann" }] }, { limit: 3 });
assert.ok(many.suggestions.length === 3 || many.suggestions.some(s => s.id === "fleischfachmann"));
assert.ok(many.suggestions.some(s => s.id === "fleischfachmann"));

// Interests are parsed from the stored profile, junk dropped.
assert.deepEqual(normalizeInterests({ build: 2, it: 5, nature: "2", food: 0 }), { build: 2, food: 0 });
assert.deepEqual(parseSchoolProfile(JSON.stringify({ interests: { care: 1, x: 2 } })).interests, { care: 1 });

assert.equal(tradeSearchTerm("Zimmermann/Zimmerin EFZ"), "Zimmermann");
assert.equal(tradeSearchTerm("Informatiker/in EFZ Applikationsentwicklung"), "Informatiker");
assert.equal(tradeSearchTerm("Logistiker/in EBA"), "Logistiker");
assert.equal(tradeSearchTerm("Charpentier/ère CFC"), "Charpentier");
assert.equal(tradeSearchTerm("Installateur/trice-électricien/ne CFC"), "Installateur-électricien");
assert.equal(tradeSearchTerm("Fleischfachmann/-frau EFZ"), "Fleischfachmann");
assert.equal(tradeSearchTerm("Fachmann/Fachfrau Gesundheit EFZ"), "Fachmann Gesundheit");
for (const t of TRADES) for (const n of [t.name.de, t.name.fr]) assert.ok(tradeSearchTerm(n).length >= 4 && !tradeSearchTerm(n).includes("/"), `search term for ${n}: ${tradeSearchTerm(n)}`);
assert.ok(suggestTrades({ wishJobs: [{ title: "Cuisinier" }] }).suggestions.some(s => s.id === "koch" && s.isWish), "French wish title matches");

console.log(`career: ${TRADES.length} trades, matching and rules passed`);

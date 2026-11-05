// Self-check for the LinkedIn checklist: npx tsx backend/src/linkedin-checklist.check.ts
import assert from "node:assert/strict";
import { linkedInProfileSchema } from "@application-pal/shared";
import { buildLiChecklist, liChecklistKey, LI_SETUP_STEPS } from "./linkedin-checklist.js";
import { emptyDraftRaw } from "./linkedin-gen.js";
import type { LiCheckOutcome } from "./linkedin-rules.js";
import type { LiSourceSuggestions } from "./linkedin-sources.js";

const profile = (o: { headline?: string; summary?: string; positions?: Array<{ id: string; company: string; start: string; description?: string; title?: string }>; skills?: string[]; present?: string[] }) =>
  linkedInProfileSchema.parse({
    basics: { firstName: "Testa", headline: o.headline ?? null, summary: o.summary ?? null },
    positions: (o.positions ?? []).map(p => ({ title: "Designer", ...p })),
    skills: (o.skills ?? []).map(name => ({ name })),
    meta: { source: "pdf", fetchedAt: "2026-11-05T00:00:00Z", present: o.present ?? ["PROFILE", "POSITIONS"] },
  });

const self = (id: string, status: LiCheckOutcome["status"], score = 0, max = 5): LiCheckOutcome =>
  ({ id, area: "firstImpression", group: id, hygiene: false, kind: "self", label: `Label ${id}`, rule: `Rule ${id}`, status, score, max, findings: [] });

const draft = profile({
  headline: "Design Lead | Design Systems",
  summary: "Ich baue Design Systems für [X] Teams.",
  positions: [{ id: "p1", company: "Testbank AG", start: "2022-01", description: "– Leitete das Design System" }, { id: "p2", company: "Agentur", start: "2017", description: "" }],
  skills: ["Figma", "Design Thinking"],
});
const raw = { ...emptyDraftRaw("de", null), recRequests: [{ to: "Ehemalige Vorgesetzte", text: "Hallo [Name] …" }], plan: [{ week: 1, tasks: ["Headline übernehmen", "Fünf Kontakte anschreiben"] }],
  featured: [{ title: "Portfolio", kind: "link" as const, why: null, url: null }] };
const sources: LiSourceSuggestions = {
  cvLang: "de", skillsKnown: false, skills: [], keywords: [],
  certifications: [{ name: "NNG UX Certificate", issuer: "NNGroup", date: "2025-11", credentialId: "1067965", sources: [], inProfile: false },
    { name: "Google AI", issuer: "Google", date: null, credentialId: null, sources: [], inProfile: true }],
  languages: [{ name: "Deutsch", level: "Muttersprache", linkedinLevel: "native", source: "CV DE", inProfile: false }],
};
const checks = [self("photo", "pass", 5), self("banner", "na"), self("featured.present", "fail", 0, 2), { ...self("rule", "fail"), kind: "rule" }];

// Before copying: the import still has the old texts.
const old = profile({ headline: "Senior Designer", positions: [{ id: "p1", company: "Testbank AG", start: "2022-01", description: "" }] });
const a = buildLiChecklist({ imported: old, draft, draftRaw: raw, sources, checks, manual: ["plan:1:0", "draft:about", "gone:item"] });
const by = (k: string) => a.items.find(i => i.key === k)!;
assert.deepEqual(a.items.filter(i => i.section === "transfer").map(i => i.key), ["draft:headline", "draft:about", "draft:pos:p1", "draft:skills", "draft:feat:portfolio"],
  "empty descriptions are no task");
assert.equal(by("draft:headline").done, false);
assert.equal(by("draft:about").blocked, "placeholders");
assert.equal(by("draft:about").done, false, "a manual tick does not count while [X] is open");
assert.deepEqual(by("draft:pos:p1").params, { title: "Designer", company: "Testbank AG" });
assert.deepEqual(a.items.filter(i => i.section === "basics").map(i => [i.key, i.auto, i.label]),
  [["self:photo", true, "Label photo"], ["self:banner", false, "Label banner"], ["self:featured-present", false, "Label featured.present"]], "only self checks");
assert.equal(by(liChecklistKey("cert", "NNG UX Certificate")).done, false);
assert.equal(by("cert:google-ai").auto, true);
assert.equal(by("lang:deutsch").params.level, "native");
assert.equal(by("rec:0").copy, "Hallo [Name] …");
assert.equal(by("plan:1:0").done, true, "manual tick");
assert.equal(by("plan:1:1").label, "Fünf Kontakte anschreiben");
assert.ok(!a.items.some(i => i.key === "gone:item"));
assert.deepEqual([a.done, a.total], [3, 14]);

// After copying and re-importing (PDF): headline and position match → auto-done; skills unknown in a PDF.
const after = profile({ headline: "Design Lead | Design Systems", positions: [{ id: "x9", company: "Testbank AG", start: "2022-01", description: "- Leitete das Design System" }], skills: ["Figma"] });
const b = buildLiChecklist({ imported: after, draft, draftRaw: raw, sources, checks, manual: [] });
assert.equal(b.items.find(i => i.key === "draft:headline")!.auto, true);
assert.equal(b.items.find(i => i.key === "draft:pos:p1")!.auto, true, "matched by company + start, dash style ignored");
assert.equal(b.items.find(i => i.key === "draft:skills")!.auto, false, "a PDF cannot prove the skills");

// ZIP with all skills.
const zip = profile({ skills: ["figma", "Design Thinking", "Miro"], present: ["PROFILE", "SKILLS"] });
assert.equal(buildLiChecklist({ imported: zip, draft, draftRaw: raw, sources: null, checks: [], manual: [] }).items.find(i => i.key === "draft:skills")!.auto, true);

// No draft: only basics and documents.
const c = buildLiChecklist({ imported: old, draft: null, draftRaw: null, sources, checks, manual: [] });
assert.deepEqual([...new Set(c.items.map(i => i.section))], ["basics", "documents"]);

// No profile at all: the set-up steps come first, manual only; self-report items carry their rule as tip.
const d0 = buildLiChecklist({ imported: null, draft, draftRaw: raw, sources: null, checks, manual: ["setup:account"], setup: true });
assert.equal(d0.items[0].section, "setup");
assert.equal(d0.items.filter(i => i.section === "setup").length, LI_SETUP_STEPS.length);
assert.equal(d0.items.find(i => i.key === "setup:account")!.done, true);
assert.equal(d0.items.find(i => i.key === "setup:url")!.done, false);
assert.ok(d0.items.filter(i => i.kind === "self").every(i => i.tip !== null), "self items carry the checkpoint rule");
assert.ok(!a.items.some(i => i.section === "setup"), "no set-up steps once a profile exists");

assert.ok(liChecklistKey("cert", "A very long certificate name that goes on and on and on, issued by someone").length <= 60);
console.log("linkedin-checklist.check: all assertions passed");

// Self-check for linkedin-rules.ts — run: npx tsx backend/src/linkedin-rules.check.ts
import assert from "node:assert/strict";
import { linkedInProfileSchema, type LinkedInProfile } from "@application-pal/shared";
import { runLinkedInCheck, parseLiDate, resultStatements, type LiCheckResult } from "./linkedin-rules.js";
import { LI_CRITERIA } from "./linkedin-criteria.js";

const NOW = new Date("2026-11-04T12:00:00Z");
const ALL = ["PROFILE", "POSITIONS", "EDUCATION", "SKILLS", "CERTIFICATIONS", "LANGUAGES", "HONORS", "PROJECTS", "PUBLICATIONS",
  "RECOMMENDATIONS", "ENDORSEMENTS", "CONNECTIONS", "GROUPS", "ARTICLES", "MEMBER_SHARE_INFO", "ALL_COMMENTS"];
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString().slice(0, 19).replace("T", " ");

// ── catalogue sanity ──
const sumArea = (a: string) => LI_CRITERIA.checks.filter(c => {
  const g = LI_CRITERIA.groups.find(x => x.id === c.group)!; return g.area === a;
}).reduce((s, c) => s + c.max, 0);
for (const [a, max] of Object.entries(LI_CRITERIA.areaMax)) assert.equal(sumArea(a), max, `area ${a} adds up to ${max}`);
assert.equal(LI_CRITERIA.aiChecks.reduce((s, c) => s + c.max, 0), LI_CRITERIA.aiMax);
assert.equal(new Set([...LI_CRITERIA.checks, ...LI_CRITERIA.aiChecks].map(c => c.id)).size, LI_CRITERIA.checks.length + LI_CRITERIA.aiChecks.length, "unique ids");

// ── date parser ──
const ymd = (d: Date | null) => d?.toISOString().slice(0, 10);
assert.equal(ymd(parseLiDate("Mar 2021")), "2021-03-01");
assert.equal(ymd(parseLiDate("März 2021")), "2021-03-01");
assert.equal(ymd(parseLiDate("févr. 2020")), "2020-02-01");
assert.equal(ymd(parseLiDate("2021-03")), "2021-03-01");
assert.equal(ymd(parseLiDate("03/2021")), "2021-03-01");
assert.equal(ymd(parseLiDate("05/12/24, 10:22 AM")), "2024-05-12");
assert.equal(ymd(parseLiDate("2024-05-12 10:22:33")), "2024-05-12");
assert.equal(ymd(parseLiDate("2019")), "2019-01-01");
assert.equal(parseLiDate("irgendwann"), null);
assert.equal(parseLiDate(""), null);

// ── result statements ──
assert.equal(resultStatements("• Led a team of 8 designers\n• Shipped 3 products to 2M users\n• ok").length, 2);
assert.equal(resultStatements("Verantwortlich für das Designsystem aller Produkte. Führung von 6 Personen im Team.").length, 2);
assert.equal(resultStatements(null).length, 0);

// ── reference-like profile (calibration case 04.11.2026) ──
// Expected top findings: no position descriptions, 0 recommendations, title contradiction, only 10 skills.
const ref: LinkedInProfile = linkedInProfileSchema.parse({
  basics: {
    firstName: "Alex", lastName: "Muster",
    headline: "Design Lead | Design Systems & UX Strategy | Building accessible products for fintech",
    summary: "I design digital products that people understand on the first try.\n\nFor 15 years I have led design teams at banks and agencies, built design systems used by 40 product teams and won 3 awards.\n\nToday I focus on accessible fintech products and on design operations.\n\n" + "More detail about my approach to research, prototyping and delivery. ".repeat(14) + "\n\nLet's talk about design systems — send me a message.",
    location: "Zürich, Schweiz", industry: "Design", publicUrl: "https://www.linkedin.com/in/alex-muster-4a1b2c3d", websites: ["https://alexmuster.design"],
  },
  positions: [
    { id: "p1", title: "Senior Product Designer", company: "Bank AG", start: "Jan 2022", end: null, description: null },
    { id: "p2", title: "UX Designer", company: "Agentur", start: "Mar 2017", end: "Dec 2021", description: "" },
    { id: "p3", title: "Grafiker", company: "Studio", start: "2012", end: "2016", description: null },
  ],
  education: [{ id: "e1", school: "ZHdK", degree: "BA Visual Communication", start: "2008", end: "2011" }],
  skills: Array.from({ length: 10 }, (_, i) => ({ name: `Skill ${i}`, endorsements: i < 2 ? 12 : 1 })),
  certifications: [{ id: "c1", name: "Accessibility", start: "Jun 2025" }],
  languages: [{ name: "Deutsch", proficiency: "Native" }, { name: "English", proficiency: "Professional" }],
  honors: [], projects: [], publications: [], courses: [], volunteering: [],
  recommendations: { received: [], givenCount: 2 },
  activity: {
    posts: [{ date: daysAgo(10), text: "A longer post about design tokens and why naming matters so much for teams that ship weekly." }, { date: daysAgo(40), text: "Short link", url: "https://x" }, { date: daysAgo(300), text: "Old post with enough text to count as own content for sure." }],
    comments: [{ date: daysAgo(5), text: "Agree — tokens need a single owner, otherwise naming drifts within weeks." }],
    articles: [],
  },
  network: { connections: 812, groups: ["Design Systems Coalition"] },
  meta: { source: "api", fetchedAt: NOW.toISOString(), notProvided: ["photo", "banner", "customUrl", "featured", "openTo"], failed: [], present: ALL },
});

const r = runLinkedInCheck({ profile: ref, uiLang: "de", now: NOW });
const byId = (res: LiCheckResult, id: string) => [...res.checks, ...res.ai.checks].find(c => c.id === id)!;

// not rated → excluded from the maximum, total extrapolated
assert.equal(byId(r, "photo").status, "na");
assert.equal(byId(r, "headline.niche").status, "na");
assert.ok(r.rated.max < 100);
assert.equal(r.total, Math.round((r.rated.score / r.rated.max) * 100), "total = earned / ratedMax × 100");
assert.equal(r.areas.firstImpression.fullMax, 25);

// expected findings
assert.equal(byId(r, "exp.recent").score, 0, "no position descriptions");
assert.equal(byId(r, "exp.numbers").score, 0);
assert.equal(byId(r, "recs.count").score, 0, "0 recommendations");
assert.equal(byId(r, "exp.titles").status, "pass", "'Product Designer' overlaps 'Design Lead' via design*");
assert.equal(byId(r, "skills.count").score, 0, "10 skills");
assert.equal(byId(r, "skills.endorsed").score, 0);
assert.equal(byId(r, "basics.url").score, 0, "default URL with hex suffix");
assert.equal(byId(r, "ai.nameUrl").score, 1);
assert.equal(byId(r, "about.structure").score, 2);
assert.equal(byId(r, "about.cta").score, 2);
assert.equal(byId(r, "posts.rhythm").score, 2, "2 posts in 90 days");
assert.equal(byId(r, "comments.regular").score, 1);
assert.equal(byId(r, "network.size").score, 2);
assert.equal(byId(r, "network.groups").score, 1);
assert.equal(byId(r, "exp.older").status, "pass", "year-only end '2016' counts as Dec 2016 → Mar 2017 is no gap");
assert.ok(r.steps[0].gain >= r.steps[r.steps.length - 1].gain, "steps sorted by gain");
assert.ok(r.steps.some(s => s.id === "recommendations"));
assert.ok(r.recommendations.find(x => x.id === "goal" && !x.ok));
assert.equal(r.ai.fullMax, 8);
assert.ok(!r.checks.some(c => c.area === ("ai" as string)), "AI checks never in the main list");

// title contradiction: headline about "Design Lead", current position "Projektleiter Bau"
const contra = runLinkedInCheck({ profile: { ...ref, positions: [{ ...ref.positions[0], title: "Projektleiter Bau" }] }, uiLang: "de", now: NOW });
assert.equal(byId(contra, "exp.titles").score, 0);
assert.match(byId(contra, "exp.titles").findings[0].text, /Projektleiter Bau/);

// target role switches headline.role / keywords from na to rule
const withGoal = runLinkedInCheck({ profile: ref, uiLang: "de", now: NOW, goal: { targetRole: "Design Lead" } });
assert.equal(byId(withGoal, "headline.role").score, 2);
assert.equal(byId(withGoal, "headline.keywords").score, 2);
const late = runLinkedInCheck({ profile: { ...ref, basics: { ...ref.basics, headline: "Ich gestalte barrierefreie Finanzprodukte für Banken und Versicherungen | Design Lead" } }, uiLang: "de", now: NOW, goal: { targetRole: "Design Lead" } });
assert.equal(byId(late, "headline.role").score, 1, "role after 60 characters");

// self-report fills in what no import delivers
const withSelf = runLinkedInCheck({ profile: ref, uiLang: "de", now: NOW, selfReport: { photo: 5, banner: 3 } });
assert.equal(byId(withSelf, "photo").status, "pass");
assert.equal(byId(withSelf, "banner").status, "fail");
assert.equal(withSelf.rated.max, r.rated.max + 10);

// waiver: accepted check scores full, rawTotal keeps the unwaived score
const waived = runLinkedInCheck({ profile: ref, uiLang: "de", now: NOW, accepted: ["basics.url"] });
assert.equal(byId(waived, "basics.url").status, "accepted");
assert.equal(waived.rawTotal, r.total);
assert.equal(waived.total - waived.rawTotal, waived.acceptedGain);

// LLM judgement fills llm checks
const withLlm = runLinkedInCheck({ profile: ref, uiLang: "de", now: NOW, llm: { "headline.niche": { score: 2 }, "about.hook": { score: 1, findings: ["Hook zu allgemein"] } } });
assert.equal(byId(withLlm, "headline.niche").status, "pass");
assert.equal(byId(withLlm, "about.hook").score, 1);
assert.deepEqual(byId(withLlm, "about.hook").findings.map(f => f.text), ["Hook zu allgemein"]);

// buzzwords: −0.5 each, never below 0 for About
const buzz = runLinkedInCheck({ profile: { ...ref, basics: { ...ref.basics, summary: "Leidenschaftlicher, ergebnisorientierter Visionär mit Mehrwert schaffen." } }, uiLang: "de", now: NOW });
assert.equal(byId(buzz, "about.phrases").status, "fail");
assert.ok(buzz.areas.content.score >= 0);
assert.ok(byId(buzz, "about.phrases").findings.length >= 3);

// empty sections the source delivered score 0; missing domains are "na"
const partial = runLinkedInCheck({ profile: { ...ref, meta: { ...ref.meta, present: ["PROFILE", "POSITIONS"] } }, uiLang: "en", now: NOW });
assert.equal(byId(partial, "recs.count").status, "na");
assert.equal(byId(partial, "posts.rhythm").status, "na");
assert.equal(byId(partial, "network.size").score, 2, "connections count still known");
assert.ok(partial.recommendations.find(x => x.id === "domains"));
const empty = runLinkedInCheck({ profile: { ...ref, basics: { ...ref.basics, headline: "" } }, uiLang: "en", now: NOW });
assert.equal(byId(empty, "headline.clean").score, 0);
assert.equal(byId(empty, "headline.niche").status, "fail", "missing headline scores 0, not na");

// headline hygiene
const filler = runLinkedInCheck({ profile: { ...ref, basics: { ...ref.basics, headline: "Passionate | Results-driven | Designer | Leader | Coach | Speaker" } }, uiLang: "en", now: NOW });
assert.equal(byId(filler, "headline.clean").score, 0);
const plain = runLinkedInCheck({ profile: { ...ref, basics: { ...ref.basics, headline: "UX Designer bei Bank AG" } }, uiLang: "de", now: NOW });
assert.equal(byId(plain, "headline.clean").score, 1);

// gaps
const gap = runLinkedInCheck({ profile: { ...ref, positions: [ref.positions[0], { ...ref.positions[1], end: "Jan 2020" }] }, uiLang: "de", now: NOW });
assert.equal(byId(gap, "exp.older").score, 1, "gap Jan 2020 → Jan 2022");
assert.match(byId(gap, "exp.older").findings[0].text, /24 Monaten/);

console.log(`linkedin-rules: ok — reference total ${r.total} (rated ${r.rated.score}/${r.rated.max}),`,
  Object.entries(r.areas).map(([k, a]) => `${k} ${a.score}/${a.max}`).join(", "));

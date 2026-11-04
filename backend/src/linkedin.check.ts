// Self-check for linkedin.ts — run with: npx tsx backend/src/linkedin.check.ts
import assert from "node:assert/strict";
import {
  field, parseWebsites, normalizeSnapshot, rawForStorage, profileFingerprint, profileStats,
  fetchSnapshotDomain, fetchSnapshot, LinkedInAuthError, SNAPSHOT_DOMAINS, type Snapshot,
} from "./linkedin.js";

// Field access ignores case, spaces and punctuation; empty values fall through to the next alias
assert.equal(field({ "first name": " Claus " }, "First Name"), "Claus");
assert.equal(field({ ShareCommentary: "Hallo" }, "Share Commentary"), "Hallo");
assert.equal(field({ Title: "", Name: "X" }, "Title", "Name"), "X");
assert.equal(field({ Count: 3 }, "count"), "3");
assert.equal(field({}, "Headline"), null);

assert.deepEqual(parseWebsites("[PORTFOLIO:https://portfolio.medvesek.com,OTHER:www.example.ch/x]"),
  ["https://portfolio.medvesek.com", "www.example.ch/x"]);
assert.deepEqual(parseWebsites(null), []);

// Records shaped like the ZIP export CSVs / snapshot data
const snap: Snapshot = {
  PROFILE: [{ "First Name": "Claus", "Last Name": "Medvesek", Headline: "Senior UX Designer", Summary: "Ich gestalte …",
    "Geo Location": "Zürich, Switzerland", Industry: "Design", Websites: "[PORTFOLIO:https://portfolio.medvesek.com]" }],
  POSITIONS: [
    { "Company Name": "UBS", Title: "Senior UX Designer", Description: "", Location: "Zürich", "Started On": "Mar 2021", "Finished On": "" },
    { "Company Name": "SMG", Title: "Lead Designer", Description: "Led a team of 6", "Started On": "Jan 2018", "Finished On": "Feb 2021" },
  ],
  SKILLS: [{ Name: "UX Design" }, { Name: "Design Systems" }, { Name: "" }],
  ENDORSEMENTS: [
    { "Skill Name": "UX Design", "Endorsement Status": "ACCEPTED" },
    { "Skill Name": "ux design", "Endorsement Status": "ACCEPTED" },
    { "Skill Name": "UX Design", "Endorsement Status": "HIDDEN" },
  ],
  RECOMMENDATIONS: [],
  LANGUAGES: [{ Name: "German", Proficiency: "Native or bilingual proficiency" }],
  CONNECTIONS: [{ "First Name": "A" }, { "First Name": "B" }],
  MEMBER_SHARE_INFO: [{ Date: "2026-10-01 08:00:00", ShareLink: "https://www.linkedin.com/feed/update/1", ShareCommentary: "Post" }],
  ALL_COMMENTS: [{ Date: "2026-10-02", Link: "https://www.linkedin.com/feed/update/2", Message: "Gute Punkte!" }],
};
const p = normalizeSnapshot(snap, { source: "api", fetchedAt: "2026-11-04T10:00:00Z", failed: ["GROUPS"], publicUrl: "https://www.linkedin.com/in/claus" });
assert.equal(p.basics.firstName, "Claus");
assert.equal(p.basics.headline, "Senior UX Designer");
assert.equal(p.basics.location, "Zürich, Switzerland");
assert.equal(p.basics.publicUrl, "https://www.linkedin.com/in/claus");
assert.deepEqual(p.basics.websites, ["https://portfolio.medvesek.com"]);
assert.equal(p.positions.length, 2);
assert.equal(p.positions[0].description, null);           // empty description stays null
assert.equal(p.positions[0].end, null);                    // current position
assert.equal(p.skills.length, 2);                          // empty skill name dropped
assert.equal(p.skills[0].endorsements, 2);                 // hidden endorsement not counted, case-insensitive
assert.equal(p.skills[1].endorsements, 0);
assert.equal(p.recommendations.received.length, 0);
assert.equal(p.recommendations.givenCount, 0);             // domain present → 0, not unknown
assert.equal(p.network.connections, 2);
assert.equal(p.activity.posts[0].text, "Post");
assert.equal(p.activity.comments[0].text, "Gute Punkte!");
assert.deepEqual(p.meta.failed, ["GROUPS"]);
assert.ok(p.meta.notProvided.includes("photo") && p.meta.notProvided.includes("banner"));

// Domains that were not fetched stay unknown (null), not zero
const partial = normalizeSnapshot({ PROFILE: snap.PROFILE }, { source: "zip" });
assert.equal(partial.network.connections, null);
assert.equal(partial.recommendations.givenCount, null);
assert.equal(partial.skills.length, 0);

// Raw storage never keeps connection names
const raw = rawForStorage(snap);
assert.equal("CONNECTIONS" in raw, false);
assert.equal(raw.CONNECTIONS_COUNT, 2);

// Fingerprint ignores generated ids and fetch time
const again = normalizeSnapshot(snap, { source: "api", fetchedAt: "2026-11-05T10:00:00Z", failed: ["GROUPS"], publicUrl: "https://www.linkedin.com/in/claus" });
assert.equal(profileFingerprint(p), profileFingerprint(again));
assert.notEqual(profileFingerprint(p), profileFingerprint(partial));

const st = profileStats(p);
assert.equal(st.positions, 2);
assert.equal(st.positionsWithText, 1);
assert.equal(st.connections, 2);

// ── API client against a fake LinkedIn ─────────────────────────
type Call = { url: string; headers: Record<string, string> };
function fakeLinkedIn(pages: Record<string, Array<Record<string, unknown>[]>>, status: Record<string, number> = {}) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), headers: init?.headers as Record<string, string> });
    const domain = url.searchParams.get("domain") ?? "";
    if (status[domain]) return new Response("denied", { status: status[domain] });
    const start = Number(url.searchParams.get("start") ?? 0);
    const list = pages[domain] ?? [];
    if (start >= list.length) return new Response(JSON.stringify({ message: "No data found for this memberId" }), { status: 404 });
    const links = start + 1 < list.length ? [{ rel: "next", href: `/rest/memberSnapshotData?q=criteria&domain=${domain}&start=${start + 1}&count=1` }] : [];
    return new Response(JSON.stringify({ elements: [{ snapshotDomain: domain, snapshotData: list[start] }], paging: { start, count: 1, links } }), { status: 200 });
  }) as typeof fetch;
  return { impl, calls };
}

const run = async () => {
  // Pagination: three pages joined, headers sent
  const li = fakeLinkedIn({ SKILLS: [[{ Name: "A" }], [{ Name: "B" }, { Name: "C" }], [{ Name: "D" }]] });
  const skills = await fetchSnapshotDomain("tok", "SKILLS", li.impl);
  assert.deepEqual(skills.map(s => s.Name), ["A", "B", "C", "D"]);
  assert.equal(li.calls.length, 3);
  assert.equal(li.calls[0].headers["Linkedin-Version"], "202312");
  assert.equal(li.calls[0].headers.Authorization, "Bearer tok");

  // "No data found" → empty list (0 entries), not an error
  assert.deepEqual(await fetchSnapshotDomain("tok", "RECOMMENDATIONS", li.impl), []);

  // 401 aborts the whole snapshot; other errors only mark the domain as failed
  await assert.rejects(fetchSnapshot("tok", undefined, fakeLinkedIn({}, { PROFILE: 401 }).impl), LinkedInAuthError);
  const partialRun = await fetchSnapshot("tok", undefined, fakeLinkedIn({ PROFILE: [[{ Headline: "H" }]] }, { GROUPS: 500 }).impl);
  assert.deepEqual(partialRun.failed, ["GROUPS"]);
  assert.equal(partialRun.snap.PROFILE?.[0].Headline, "H");
  assert.equal(Object.keys(partialRun.snap).length, SNAPSHOT_DOMAINS.length - 1);

  console.log("linkedin.check: all assertions passed");
};
await run();

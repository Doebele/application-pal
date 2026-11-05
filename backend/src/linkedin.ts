// ─── LinkedIn: data import (Member Data Portability API + ZIP export) ──────────
// Both sources deliver the same record shapes: the Snapshot API returns per domain
// a list of records whose keys are the column headers of the LinkedIn ZIP export
// ("First Name", "Headline", "Started On", …). normalizeSnapshot() turns either
// into one LinkedInProfile. Keys are matched case- and punctuation-insensitively
// with aliases, because LinkedIn's API docs don't pin every field name down.
// Routes live in index.ts; this file holds the pure mapping + a small API client.

import { randomUUID } from "node:crypto";
import { linkedInProfileSchema, type LinkedInProfile } from "@application-pal/shared";

export const LINKEDIN_API = "https://api.linkedin.com/rest";
export const LINKEDIN_API_VERSION = "202312";       // the snapshot endpoint only accepts this version
export const LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
export const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const LINKEDIN_DEFAULT_SCOPE = "r_dma_portability_self_serve";
export const LINKEDIN_SCOPES = ["r_dma_portability_self_serve", "r_dma_portability_member"] as const;

/** Snapshot domains the LinkedIn-Check needs, in fetch order (profile first). */
export const SNAPSHOT_DOMAINS = [
  "PROFILE", "POSITIONS", "EDUCATION", "SKILLS", "CERTIFICATIONS", "LANGUAGES", "HONORS", "PROJECTS",
  "PUBLICATIONS", "COURSES", "VOLUNTEERING_EXPERIENCES", "RECOMMENDATIONS", "ENDORSEMENTS",
  "CONNECTIONS", "GROUPS", "ARTICLES", "MEMBER_SHARE_INFO", "ALL_COMMENTS",
] as const;
export type SnapshotDomain = typeof SNAPSHOT_DOMAINS[number];
export type SnapshotRecord = Record<string, unknown>;
export type Snapshot = Partial<Record<SnapshotDomain, SnapshotRecord[]>>;

/** Profile parts no import source delivers — they stay "not rated" unless the user reports them. */
export const NOT_PROVIDED_BY_EXPORT = ["photo", "banner", "customUrl", "featured", "openTo"];

/** ZIP export file → snapshot domain (the same records, one CSV per domain). */
export const ZIP_FILE_DOMAINS: Record<string, SnapshotDomain> = {
  "profile.csv": "PROFILE", "positions.csv": "POSITIONS", "education.csv": "EDUCATION", "skills.csv": "SKILLS",
  "certifications.csv": "CERTIFICATIONS", "languages.csv": "LANGUAGES", "honors.csv": "HONORS", "projects.csv": "PROJECTS",
  "publications.csv": "PUBLICATIONS", "courses.csv": "COURSES", "volunteering.csv": "VOLUNTEERING_EXPERIENCES",
  "recommendations_received.csv": "RECOMMENDATIONS", "endorsement_received_info.csv": "ENDORSEMENTS",
  "connections.csv": "CONNECTIONS", "groups.csv": "GROUPS", "articles.csv": "ARTICLES",
  "shares.csv": "MEMBER_SHARE_INFO", "comments.csv": "ALL_COMMENTS",
};

// ── field access ────────────────────────────────────────────────
const keyNorm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
const shortId = () => randomUUID().replace(/-/g, "").slice(0, 10);

/** First non-empty value among `aliases` (matched ignoring case, spaces and punctuation). */
export function field(rec: SnapshotRecord, ...aliases: string[]): string | null {
  const wanted = aliases.map(keyNorm);
  for (const [k, v] of Object.entries(rec)) {
    if (!wanted.includes(keyNorm(k))) continue;
    if (v === null || v === undefined) continue;
    const s = (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").trim();
    if (s) return s;
  }
  return null;
}

/** URLs out of the export's website notation, e.g. "[PORTFOLIO:https://a.ch,OTHER:b.com]". */
export function parseWebsites(raw: string | null): string[] {
  if (!raw) return [];
  const urls = raw.match(/(?:https?:\/\/)?(?:[\w-]+\.)+[a-z]{2,}(?:\/[^\s,\]]*)?/gi) ?? [];
  return [...new Set(urls.map(u => u.replace(/[.,;]+$/, "")))];
}

const fullName = (r: SnapshotRecord, prefix = "") =>
  [field(r, `${prefix}First Name`), field(r, `${prefix}Last Name`)].filter(Boolean).join(" ") || null;

/** A recommendation/endorsement the member hid or declined does not count. */
const isHidden = (r: SnapshotRecord) => /^(hidden|rejected|declined|pending)$/i.test(field(r, "Status", "Endorsement Status") ?? "");

/** Turns snapshot domains (API) or ZIP CSVs into a LinkedInProfile. Missing domains stay empty. */
export function normalizeSnapshot(snap: Snapshot, opts: { source: string; fetchedAt?: string; failed?: string[]; publicUrl?: string | null }): LinkedInProfile {
  const list = (d: SnapshotDomain) => snap[d] ?? [];
  const p = list("PROFILE")[0] ?? {};

  // Endorsements per skill (received, not hidden)
  const endorsements = new Map<string, number>();
  for (const e of list("ENDORSEMENTS")) {
    if (isHidden(e)) continue;
    const skill = field(e, "Skill Name", "Skill");
    if (skill) endorsements.set(skill.toLowerCase(), (endorsements.get(skill.toLowerCase()) ?? 0) + 1);
  }
  const hasEndorsementData = snap.ENDORSEMENTS !== undefined;

  // Recommendations: the ZIP has received/given in separate files; the API domain may
  // mark the direction in a field. Without a marker a record counts as received.
  const recs = list("RECOMMENDATIONS");
  const isGiven = (r: SnapshotRecord) => /given|sent|outgoing/i.test(field(r, "Type", "Direction", "Recommendation Type") ?? "");
  const received = recs.filter(r => !isGiven(r) && !isHidden(r));
  const given = recs.filter(isGiven);

  const profile = {
    basics: {
      firstName: field(p, "First Name"), lastName: field(p, "Last Name"),
      headline: field(p, "Headline"), summary: field(p, "Summary", "About"),
      location: field(p, "Geo Location", "Location", "Address"), industry: field(p, "Industry"),
      publicUrl: field(p, "Public Profile Url", "Profile Url", "Vanity Name") ?? opts.publicUrl ?? null,
      websites: parseWebsites(field(p, "Websites", "Website")),
    },
    positions: list("POSITIONS").map(r => ({
      id: shortId(), title: field(r, "Title"), company: field(r, "Company Name", "Company"),
      location: field(r, "Location"), description: field(r, "Description"),
      start: field(r, "Started On", "Start Date"), end: field(r, "Finished On", "End Date"),
    })),
    education: list("EDUCATION").map(r => ({
      id: shortId(), school: field(r, "School Name", "School"), degree: field(r, "Degree Name", "Degree"),
      notes: field(r, "Notes"), activities: field(r, "Activities"),
      start: field(r, "Start Date", "Started On"), end: field(r, "End Date", "Finished On"),
    })),
    skills: list("SKILLS").map(r => field(r, "Name", "Skill Name", "Skill")).filter((n): n is string => !!n).map(name => ({
      name, endorsements: hasEndorsementData ? endorsements.get(name.toLowerCase()) ?? 0 : null,
    })),
    certifications: list("CERTIFICATIONS").map(r => ({
      id: shortId(), name: field(r, "Name") ?? "", authority: field(r, "Authority"), url: field(r, "Url"),
      start: field(r, "Started On"), end: field(r, "Finished On"),
    })).filter(c => c.name),
    languages: list("LANGUAGES").map(r => ({ name: field(r, "Name", "Language") ?? "", proficiency: field(r, "Proficiency") })).filter(l => l.name),
    honors: list("HONORS").map(r => ({
      id: shortId(), title: field(r, "Title", "Name") ?? "", issuer: field(r, "Issuer"), date: field(r, "Issued On", "Date"), description: field(r, "Description"),
    })).filter(h => h.title),
    projects: list("PROJECTS").map(r => ({
      id: shortId(), title: field(r, "Title", "Name") ?? "", description: field(r, "Description"), url: field(r, "Url"),
      start: field(r, "Started On"), end: field(r, "Finished On"),
    })).filter(x => x.title),
    publications: list("PUBLICATIONS").map(r => ({
      id: shortId(), title: field(r, "Name", "Title") ?? "", publisher: field(r, "Publisher"), date: field(r, "Published On", "Date"),
      description: field(r, "Description"), url: field(r, "Url"),
    })).filter(x => x.title),
    courses: list("COURSES").map(r => ({ name: field(r, "Name") ?? "" })).filter(c => c.name),
    volunteering: list("VOLUNTEERING_EXPERIENCES").map(r => ({
      id: shortId(), role: field(r, "Role", "Title"), organization: field(r, "Company Name", "Organization"), cause: field(r, "Cause"),
      description: field(r, "Description"), start: field(r, "Started On"), end: field(r, "Finished On"),
    })),
    recommendations: {
      received: received.map(r => ({
        id: shortId(), author: fullName(r) ?? field(r, "Recommender", "Author"), company: field(r, "Company"),
        jobTitle: field(r, "Job Title"), text: field(r, "Text", "Recommendation"), date: field(r, "Creation Date", "Date"),
      })),
      givenCount: snap.RECOMMENDATIONS === undefined ? null : given.length,
    },
    activity: {
      posts: list("MEMBER_SHARE_INFO").map(r => ({ date: field(r, "Date"), text: field(r, "ShareCommentary", "Share Commentary", "Commentary"), url: field(r, "ShareLink", "Share Link", "Link") })),
      comments: list("ALL_COMMENTS").map(r => ({ date: field(r, "Date"), text: field(r, "Message", "Comment"), url: field(r, "Link") })),
      articles: list("ARTICLES").map(r => ({ date: field(r, "Date", "Published On", "Created Date"), title: field(r, "Title", "Name"), url: field(r, "Url", "Link") })),
    },
    network: {
      connections: snap.CONNECTIONS === undefined ? null : list("CONNECTIONS").length,
      groups: list("GROUPS").map(r => field(r, "Name", "Title", "Group Name")).filter((g): g is string => !!g),
    },
    meta: {
      source: opts.source,
      fetchedAt: opts.fetchedAt ?? new Date().toISOString(),
      notProvided: NOT_PROVIDED_BY_EXPORT,
      failed: opts.failed ?? [],
      present: Object.keys(snap).filter(d => !(opts.failed ?? []).includes(d)),
    },
  };
  return linkedInProfileSchema.parse(profile);
}

// ── ZIP export ──────────────────────────────────────────────────
/** RFC-4180 CSV (quoted fields may contain commas, quotes and newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** CSV → records. Skips preamble lines (Connections.csv starts with "Notes:" and a blank line):
 *  the header is the first row with at least two non-empty cells — or, in single-column
 *  files like Skills.csv ("Name"), the first non-empty row. */
export function csvRecords(text: string): SnapshotRecord[] {
  const rows = parseCsv(text);
  let h = rows.findIndex(r => r.filter(c => c.trim()).length >= 2);
  if (h < 0) h = rows.findIndex(r => r.some(c => c.trim()));
  if (h < 0) return [];
  const header = rows[h].map(x => x.trim());
  return rows.slice(h + 1)
    .filter(r => r.some(c => c.trim()))
    .map(r => Object.fromEntries(header.map((k, i) => [k, (r[i] ?? "").trim()])));
}

/** LinkedIn ZIP export → snapshot. Files are matched by base name, case-insensitively;
 *  given recommendations are merged into RECOMMENDATIONS with a "given" marker. */
export function snapshotFromZip(files: Record<string, Uint8Array>): { snap: Snapshot; files: string[] } {
  const snap: Snapshot = {};
  const used: string[] = [];
  const dec = new TextDecoder("utf-8");
  for (const [path, bytes] of Object.entries(files)) {
    const base = path.split("/").pop()!.toLowerCase();
    if (base === "recommendations_given.csv") {
      const given = csvRecords(dec.decode(bytes)).map(r => ({ ...r, Type: "given" }));
      snap.RECOMMENDATIONS = [...(snap.RECOMMENDATIONS ?? []), ...given];
      used.push(path);
      continue;
    }
    const domain = ZIP_FILE_DOMAINS[base];
    if (!domain) continue;
    snap[domain] = [...(snap[domain] ?? []), ...csvRecords(dec.decode(bytes))];
    used.push(path);
  }
  return { snap, files: used };
}

/** What gets stored as `raw`: everything except connection names (only their count is kept). */
export function rawForStorage(snap: Snapshot): Snapshot & { CONNECTIONS_COUNT?: number } {
  const { CONNECTIONS, ...rest } = snap;
  return CONNECTIONS === undefined ? rest : { ...rest, CONNECTIONS_COUNT: CONNECTIONS.length };
}

/** Profile content without volatile parts (ids, fetch time) — to skip saving identical versions. */
export function profileFingerprint(p: LinkedInProfile): string {
  const strip = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(strip)
      : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== "id" && k !== "fetchedAt").map(([k, x]) => [k, strip(x)]))
      : v;
  return JSON.stringify(strip(p));
}

export function profileStats(p: LinkedInProfile) {
  return {
    positions: p.positions.length,
    positionsWithText: p.positions.filter(x => (x.description ?? "").trim().length > 0).length,
    education: p.education.length, skills: p.skills.length, certifications: p.certifications.length,
    languages: p.languages.length, recommendations: p.recommendations.received.length,
    posts: p.activity.posts.length, comments: p.activity.comments.length, articles: p.activity.articles.length,
    connections: p.network.connections ?? null, groups: p.network.groups.length,
  };
}

// ── API client ──────────────────────────────────────────────────
export class LinkedInAuthError extends Error {}

type SnapshotPage = {
  elements?: Array<{ snapshotDomain?: string; snapshotData?: SnapshotRecord[] }>;
  paging?: { start?: number; count?: number; total?: number; links?: Array<{ rel?: string; href?: string }> };
};

/**
 * All records of one snapshot domain. LinkedIn pages the snapshot (one element per
 * page) and signals the end with a 404 / "No data found". An empty list means the
 * member has no entries there (e.g. 0 recommendations) — unless PROFILE is empty
 * too, which means LinkedIn is still collating the snapshot (checked by the caller).
 */
export async function fetchSnapshotDomain(token: string, domain: SnapshotDomain, fetchImpl: typeof fetch = fetch): Promise<SnapshotRecord[]> {
  const out: SnapshotRecord[] = [];
  let start = 0;
  for (let page = 0; page < 200; page++) {
    const url = `${LINKEDIN_API}/memberSnapshotData?q=criteria&domain=${domain}${start ? `&start=${start}` : ""}`;
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, "Linkedin-Version": LINKEDIN_API_VERSION } });
    if (res.status === 401) throw new LinkedInAuthError("LinkedIn hat den Zugang abgelehnt (abgelaufen oder widerrufen)");
    if (res.status === 403) throw new LinkedInAuthError("Kein Zugriff: Die App braucht das Produkt „Member Data Portability API (Member)“");
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 404 || /no data found/i.test(body)) break;
      throw new Error(`LinkedIn ${res.status}: ${body.slice(0, 160)}`);
    }
    const json = await res.json() as SnapshotPage;
    const records = (json.elements ?? []).flatMap(e => e.snapshotData ?? []);
    out.push(...records);
    const next = json.paging?.links?.find(l => l.rel === "next")?.href;
    const nextStart = next ? Number(new URL(next, LINKEDIN_API).searchParams.get("start")) : NaN;
    if (!records.length) break;
    if (Number.isFinite(nextStart) && nextStart > start) start = nextStart;
    else if (next) start += json.paging?.count || 1;
    else break;
  }
  return out;
}

/** Fetches all domains; a failing domain is reported, the others still load. */
export async function fetchSnapshot(token: string, onDomain?: (d: SnapshotDomain, i: number) => void, fetchImpl: typeof fetch = fetch) {
  const snap: Snapshot = {};
  const failed: string[] = [];
  for (const [i, d] of SNAPSHOT_DOMAINS.entries()) {
    onDomain?.(d, i);
    try {
      snap[d] = await fetchSnapshotDomain(token, d, fetchImpl);
    } catch (err) {
      if (err instanceof LinkedInAuthError) throw err;
      failed.push(d);
    }
  }
  return { snap, failed };
}

// Lehrstellen import (phase 5d): structured facts from posting pages, read without a browser.
// - Yousty (yousty.ch): schema.org JobPosting JSON-LD + the description block of the page.
// - LENA (berufsberatung.ch/…/lehrstellen/<id>): the server-rendered detail page (no description;
//   trade, company, place, start year, application address with contact person, phone, e-mail).
// - Any other page with a schema.org JobPosting (many job boards) gets the JSON-LD part too.
// Plus the region check: posting location vs. the pupil's home (postcode / town / canton).
// Pure logic — fetching lives in index.ts. Self-check: npx tsx backend/src/job-sources.check.ts

export type JobSource = "yousty" | "lena" | "jsonld" | null;
export type SourceHints = {
  source: JobSource;
  sourceLabel?: string;                 // stored in applications.source
  company?: string; role?: string; apprenticeship?: string;
  applicationKind?: "lehrstelle" | "schnupperlehre";
  location?: string;                    // "3422 Kirchberg BE" / "Allschwil (BL)"
  contactPerson?: string; contactGender?: "f" | "m";
  email?: string; phone?: string;
  startDate?: string;                   // "2027-08-01" or "2027"
  positions?: number;
  text: string;                         // clean, labelled text for the model / regex fallback ("" = none)
};

/** A link to a search / list page instead of one posting. */
export function isListUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, "");
    if (h === "yousty.ch") return !/\/(lehrstellen|schnupperlehren)\/profile\/\d+/.test(u.pathname) && /\/(lehrstellen|schnupperlehren)\/?$/.test(u.pathname);
    if (h === "berufsberatung.ch") return /\/suche\//.test(u.pathname) || /\/dyn\/show\//.test(u.pathname) || /^\/lena\/?$/.test(u.pathname);
  } catch { /* not a URL */ }
  return false;
}

export function detectSource(url: string): JobSource {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (h === "yousty.ch") return "yousty";
    if (h === "berufsberatung.ch" || h === "orientation.ch" || h === "orientamento.ch") return "lena";
  } catch { /* not a URL */ }
  return null;
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", shy: "" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** HTML → trimmed text lines (block elements and <br> break lines; scripts/styles dropped). */
export function htmlLines(html: string): string[] {
  const t = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/li|\/h[1-6]|\/div|\/dt|\/dd|\/tr|div|li|p|h[1-6]|dt|dd|tr|section|\/section|header|\/header)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(t).split("\n").map(l => l.replace(/[\s ]+/g, " ").trim()).filter(Boolean);
}

function textOf(html: string): string { return htmlLines(html).join(" "); }

// ─── schema.org JobPosting ────────────────────────────────────────────────────

type Json = Record<string, unknown>;
function asObj(v: unknown): Json | null { return v && typeof v === "object" && !Array.isArray(v) ? v as Json : null; }
function str(v: unknown, max = 300): string { return typeof v === "string" ? decodeEntities(v).replace(/\s+/g, " ").trim().slice(0, max) : ""; }

/** All JobPosting objects in the page's JSON-LD (handles arrays and @graph). */
export function jsonLdJobPostings(html: string): Json[] {
  const out: Json[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(visit); return; }
    const o = asObj(v); if (!o) return;
    const type = o["@type"];
    if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) out.push(o);
    if (o["@graph"]) visit(o["@graph"]);
  };
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(m[1].trim())); } catch { /* broken block */ }
  }
  return out;
}

function placeOf(jp: Json): string {
  const loc = Array.isArray(jp.jobLocation) ? jp.jobLocation[0] : jp.jobLocation;
  const addr = asObj(asObj(loc)?.address);
  if (!addr) return "";
  const town = str(addr.addressLocality, 80), region = str(addr.addressRegion, 10), zip = str(addr.postalCode, 10);
  return [zip, town && region && !town.endsWith(region) ? `${town} ${region}` : town].filter(Boolean).join(" ");
}

function jsonLdHints(jp: Json): Omit<SourceHints, "source" | "text"> & { description?: string } {
  const org = asObj(jp.hiringOrganization);
  const title = str(jp.title, 200);
  const occupation = str(jp.occupationalCategory, 120);
  const start = str(jp.jobStartDate, 10);
  const desc = typeof jp.description === "string" ? (/<[a-z]/i.test(jp.description) ? htmlLines(jp.description).join("\n") : str(jp.description, 20000)) : "";
  return {
    ...(str(org?.name, 120) ? { company: str(org?.name, 120) } : {}),
    ...(title ? { role: title } : {}),
    ...(occupation ? { apprenticeship: occupation } : {}),
    ...(placeOf(jp) ? { location: placeOf(jp) } : {}),
    ...(/^\d{4}(-\d{2}-\d{2})?$/.test(start) ? { startDate: start } : {}),
    ...(desc ? { description: desc } : {}),
  };
}

// ─── Yousty ───────────────────────────────────────────────────────────────────

/** Description block of a Yousty posting: from "Lehrstellenbeschreibung" up to "Dein Arbeitsort". */
function youstyDescription(lines: string[]): string {
  const start = lines.findIndex(l => /^(Lehrstellenbeschreibung|Beschreibung der Schnupperlehre|Description de la place d'apprentissage|Descrizione del posto)$/i.test(l));
  if (start < 0) return "";
  let end = lines.findIndex((l, i) => i > start && /^(Dein Arbeitsort|Ton lieu de travail|Il tuo luogo di lavoro)$/i.test(l));
  if (end < 0) end = Math.min(lines.length, start + 80);
  return lines.slice(start + 1, end).join("\n");
}

export function youstyHints(url: string, html: string): SourceHints {
  const jp = jsonLdJobPostings(html)[0];
  const base = jp ? jsonLdHints(jp) : {};
  const lines = htmlLines(html);
  const description = youstyDescription(lines) || base.description || "";
  const kind = /\/schnupperlehren\//.test(url) ? "schnupperlehre" : "lehrstelle";
  const role = base.apprenticeship || base.role?.replace(/^(Lehrstelle|Schnupperlehre) als /i, "");
  return finish({
    source: "yousty", sourceLabel: "Yousty", applicationKind: kind,
    company: base.company, role, apprenticeship: base.apprenticeship || role, location: base.location, startDate: base.startDate,
  }, description);
}

// ─── LENA (berufsberatung.ch) ────────────────────────────────────────────────

const ADDRESS_LABEL = /^(Bewerbungsadresse|Adresse de postulation|Adresse pour la postulation|Indirizzo per la candidatura|Adresse de candidature)$/i;
const SALUTE = /^(Frau|Herr|Madame|Monsieur|Mme\.?|M\.|Signora|Signor)\s+(.+)$/i;

export function lenaHints(url: string, html: string): SourceHints {
  const lines = htmlLines(html);
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const heading = h1 ? textOf(h1[1]) : "";                     // "Abdichter/-in EFZ (2027)"
  const role = heading.replace(/\s*\(\d{4}\)$/, "");
  const startYear = heading.match(/\((\d{4})\)$/)?.[1] ?? lines.find(l => role && l.startsWith(role) && /\(\d{4}\)$/.test(l))?.match(/\((\d{4})\)$/)?.[1];
  // In the page header the trade is followed by "Company, department"
  const iRole = role ? lines.findIndex((l, i) => l === role && !!lines[i + 1] && !lines[i + 1].startsWith(role)) : -1;

  const a = lines.findIndex(l => ADDRESS_LABEL.test(l));
  const block = a >= 0 ? lines.slice(a + 1, a + 14) : [];
  const stop = block.findIndex(l => /^(Online bewerben|Postuler en ligne|Candidarsi online|Sprache|Langue|Lingua)$/i.test(l));
  const addr = stop >= 0 ? block.slice(0, stop) : block;

  const company = addr[0] || (iRole >= 0 ? (lines[iRole + 1] ?? "").split(",")[0].trim() : "");
  const contactLine = addr.find(l => SALUTE.test(l));
  const salute = contactLine?.match(SALUTE);
  // "6460 Altdorf UR (UR)" → "6460 Altdorf UR" (LENA appends the canton even when the town has it)
  const zipTown = addr.find(l => /^\d{4}\s+\S/.test(l))?.replace(/\s*(Tel\.?|Tél\.?).*$/i, "").replace(/\b([A-Z]{2})\s*\(\1\)$/, "$1");
  // Phone and e-mail are links right after the address label
  const afterLabel = (() => { const m = html.match(/(Bewerbungsadresse|Adresse de postulation|Adresse pour la postulation|Indirizzo per la candidatura|Adresse de candidature)/i); return m ? html.slice(m.index!, m.index! + 6000) : ""; })();
  const email = afterLabel.match(/href="mailto:([^"?]+)/i)?.[1]?.trim();
  const phone = afterLabel.match(/href="tel:([^"]+)/i)?.[1]?.trim();
  const valueAfter = (re: RegExp) => { const i = lines.findIndex(l => re.test(l)); return i >= 0 ? lines[i + 1] : undefined; };
  const language = valueAfter(/^(Sprache|Langue|Lingua)$/i);
  const bm = valueAfter(/^(Berufsmaturität|Maturité professionnelle|Maturità professionale)$/i);
  const posIdx = lines.findIndex((l, i) => /^\d{1,2}$/.test(l) && /^(Lehrstellen?|places? d'apprentissage|posti di tirocinio)$/i.test(lines[i + 1] ?? ""));
  const positions = posIdx >= 0 ? Number(lines[posIdx]) : undefined;
  const department = iRole >= 0 ? (lines[iRole + 1] ?? "").split(",").slice(1).join(",").trim() : "";
  const kind = /schnupper|stage|stages-d-orientation|stagi/i.test(new URL(url).pathname) ? "schnupperlehre" : "lehrstelle";

  const gender = salute ? (/^(Frau|Madame|Mme|Signora)/i.test(salute[1]) ? "f" : "m") as "f" | "m" : undefined;
  const contactPerson = salute?.[2]?.trim();
  // LENA has no free description — build a short labelled summary for the letter prompts
  const summary = [
    role && `Lehrberuf: ${role}`,
    company && `Lehrbetrieb: ${company}${department ? ` (${department})` : ""}`,
    zipTown && `Ort: ${zipTown}`,
    startYear && `Lehrbeginn: ${startYear}`,
    positions && `Freie Lehrstellen: ${positions}`,
    language && `Sprache: ${language}`,
    bm && `Berufsmaturität: ${bm}`,
    contactPerson && `Kontakt: ${salute![1]} ${contactPerson}`,
  ].filter(Boolean).join("\n");
  return finish({
    source: "lena", sourceLabel: "berufsberatung.ch (LENA)", applicationKind: kind,
    company: company || undefined, role: role || undefined, apprenticeship: role || undefined,
    location: zipTown, contactPerson, contactGender: gender, email, phone,
    startDate: startYear, positions,
  }, summary);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

function finish(h: Omit<SourceHints, "text">, text: string): SourceHints {
  const clean = Object.fromEntries(Object.entries(h).filter(([, v]) => v !== undefined && v !== "")) as Omit<SourceHints, "text">;
  const head = [clean.role && `${clean.role}`, clean.company, clean.location].filter(Boolean).join(" · ");
  return { ...clean, source: h.source, text: [head, text].filter(Boolean).join("\n\n").trim() };
}

/** Structured facts for a fetched posting; `null` when the page offers nothing beyond its plain text. */
export function sourceHints(url: string, html: string): SourceHints | null {
  const src = detectSource(url);
  if (src === "yousty") return youstyHints(url, html);
  if (src === "lena") { const h = lenaHints(url, html); return h.role || h.company ? h : null; }
  const jp = jsonLdJobPostings(html)[0];
  if (!jp) return null;
  const { description, ...rest } = jsonLdHints(jp);
  return finish({ source: "jsonld", ...rest }, description ?? "");
}

// ─── Region check ────────────────────────────────────────────────────────────

const CANTONS = ["AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR", "JU", "LU", "NE", "NW", "OW", "SG", "SH", "SO", "SZ", "TG", "TI", "UR", "VD", "VS", "ZG", "ZH"];
export type Place = { zip?: string; town?: string; canton?: string };
export type RegionLevel = "same_town" | "near" | "region" | "far" | "unknown";

/** "3422 Kirchberg BE", "Allschwil (BL)", "Bern", "8005 Zürich" → postcode / town / canton. */
export function parsePlace(s: string | null | undefined): Place {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return {};
  const zip = t.match(/\b(\d{4})\b/)?.[1];
  const canton = t.match(new RegExp(`(?:\\(|\\s|,|^)(${CANTONS.join("|")})\\)?(?:\\s|,|$)`))?.[1];
  const town = t.replace(/\b\d{4}\b/, "").replace(new RegExp(`\\(?\\b(${CANTONS.join("|")})\\b\\)?`), "").replace(/^[\s,]+|[\s,]+$/g, "").split(",")[0].trim() || undefined;
  return { ...(zip ? { zip } : {}), ...(town ? { town } : {}), ...(canton ? { canton } : {}) };
}

const norm = (s?: string) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");

/**
 * Rough region match without any external service. Swiss postcodes are grouped by area:
 * the same first two digits = the same area ("near", usually < ~30 km), the same first digit =
 * the same larger region, otherwise "far". A canton boundary alone says little (Allschwil BL is next
 * to Basel BS), so the canton is only used when a postcode is missing. Travel time needs the ÖV check.
 */
export function regionMatch(home: Place, job: Place): RegionLevel {
  if (!home.zip && !home.town) return "unknown";
  if (!job.zip && !job.town && !job.canton) return "unknown";
  if ((home.zip && job.zip && home.zip === job.zip) || (home.town && job.town && norm(home.town) === norm(job.town))) return "same_town";
  if (home.zip && job.zip) {
    if (home.zip.slice(0, 2) === job.zip.slice(0, 2)) return "near";
    return home.zip[0] === job.zip[0] ? "region" : "far";
  }
  if (home.canton && job.canton) return home.canton === job.canton ? "region" : "far";
  return "unknown";
}

/** "PT1H12M" / "00d01:12:00" (transport.opendata.ch) → minutes. */
export function durationMinutes(d: string | null | undefined): number | null {
  if (!d) return null;
  const m = d.match(/^(\d+)d(\d{2}):(\d{2}):(\d{2})$/);
  if (m) return Number(m[1]) * 1440 + Number(m[2]) * 60 + Number(m[3]);
  const iso = d.match(/^PT(?:(\d+)H)?(?:(\d+)M)?/);
  return iso ? Number(iso[1] ?? 0) * 60 + Number(iso[2] ?? 0) : null;
}

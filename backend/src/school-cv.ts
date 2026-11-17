// Pupil CV (persona schulabgaenger): built from the pupil profile (user_profile.school_profile,
// incl. its `cv` part) plus the personal details in user_profile. Pure logic — the routes in
// index.ts add the photo bytes and write the PDF / Google Doc.
// Self-check: npx tsx backend/src/school-cv.check.ts
import type { SchoolProfile } from "./letter-kinds.js";

export type CvLang = "de" | "en" | "fr";
/** Pupil profile with a not yet normalised `cv` part. */
export type ProfileIn = Omit<SchoolProfile, "cv"> & { cv?: unknown };

/** CV-only fields, stored as SchoolProfile.cv. */
export type SchoolCvData = {
  birthDate?: string;            // "2010-04-17" or free text
  nationality?: string;          // "Schweiz" / "Schweiz, Heimatort Bern"
  street?: string;
  zipCity?: string;
  photo?: string;                // data:image/jpeg;base64,… (resized in the browser)
  schools?: { from?: string; to?: string; name: string; place?: string }[];
  languages?: { name: string; level?: "native" | "very_good" | "good" | "basic" | "" }[];  // level: CvLevel
  it?: string;                   // "Word, PowerPoint, Tastaturschreiben"
  hobbies?: string;              // extra hobbies beyond the profile experiences
  parents?: { name: string; job?: string; phone?: string }[];
  references?: { name: string; role?: string; phone?: string; email?: string }[];
};

export type Person = { name?: string | null; email?: string | null; phone?: string | null; location?: string | null; photoUrl?: string | null };

export type CvRow = { when?: string; what: string; detail?: string };
export type CvSection = { id: string; title: string; rows: CvRow[] };
export type SchoolCvModel = {
  lang: CvLang;
  title: string;
  name: string;
  hasPhoto: boolean;
  personal: { label: string; value: string }[];
  sections: CvSection[];
};

const L: Record<CvLang, Record<string, string>> = {
  de: {
    title: "Lebenslauf", personal: "Personalien", address: "Adresse", phone: "Telefon", email: "E-Mail", birth: "Geburtsdatum", nationality: "Nationalität",
    school: "Schulbildung", taster: "Schnupperlehren", experience: "Erfahrungen und Ämtli", wish: "Berufswunsch", languages: "Sprachen", it: "Informatik",
    hobbies: "Hobbys und Freizeit", parents: "Eltern", references: "Referenzen", today: "heute",
    native: "Muttersprache", very_good: "sehr gut", good: "gut", basic: "Grundkenntnisse",
    schule: "Schulprojekt", hobby: "Hobby", verein: "Verein / Ämtli", job: "Taschengeldjob", schnupper: "Schnupperlehre", anderes: "Sonstiges",
  },
  en: {
    title: "Curriculum Vitae", personal: "Personal details", address: "Address", phone: "Phone", email: "Email", birth: "Date of birth", nationality: "Nationality",
    school: "Education", taster: "Taster apprenticeships", experience: "Experience and responsibilities", wish: "Career goal", languages: "Languages", it: "IT skills",
    hobbies: "Hobbies and interests", parents: "Parents", references: "References", today: "present",
    native: "native", very_good: "very good", good: "good", basic: "basic",
    schule: "School project", hobby: "Hobby", verein: "Club / duty", job: "Part-time job", schnupper: "Taster apprenticeship", anderes: "Other",
  },
  fr: {
    title: "Curriculum vitae", personal: "Données personnelles", address: "Adresse", phone: "Téléphone", email: "E-mail", birth: "Date de naissance", nationality: "Nationalité",
    school: "Formation scolaire", taster: "Stages d'essai", experience: "Expériences et responsabilités", wish: "Projet professionnel", languages: "Langues", it: "Informatique",
    hobbies: "Loisirs", parents: "Parents", references: "Références", today: "aujourd'hui",
    native: "langue maternelle", very_good: "très bien", good: "bien", basic: "notions",
    schule: "Projet scolaire", hobby: "Loisir", verein: "Club / responsabilité", job: "Petit job", schnupper: "Stage d'essai", anderes: "Autre",
  },
};

export function cvLabels(lang: CvLang): Record<string, string> { return L[lang]; }

const s = (v: unknown, max = 300): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const LEVELS = ["native", "very_good", "good", "basic"] as const;
type CvLevel = (typeof LEVELS)[number] | "";

/** Normalises the stored `cv` part (unknown JSON → SchoolCvData). The photo must be a JPEG/PNG data URL ≤ 400 kB. */
export function normalizeCvData(raw: unknown): SchoolCvData {
  const j = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.slice(0, 12) : []) as Record<string, unknown>[];
  const photo = typeof j.photo === "string" && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(j.photo) && j.photo.length <= 400_000 ? j.photo : "";
  const out: SchoolCvData = {
    birthDate: s(j.birthDate, 40), nationality: s(j.nationality, 120), street: s(j.street, 120), zipCity: s(j.zipCity, 120),
    schools: arr(j.schools).map(x => ({ from: s(x.from, 20), to: s(x.to, 20), name: s(x.name, 160), place: s(x.place, 120) })).filter(x => x.name),
    languages: arr(j.languages).map(x => ({ name: s(x.name, 60), level: ((LEVELS as readonly string[]).includes(x.level as string) ? x.level : "") as CvLevel })).filter(x => x.name),
    it: s(j.it, 300), hobbies: s(j.hobbies, 400),
    parents: arr(j.parents).map(x => ({ name: s(x.name, 120), job: s(x.job, 120), phone: s(x.phone, 40) })).filter(x => x.name),
    references: arr(j.references).map(x => ({ name: s(x.name, 120), role: s(x.role, 160), phone: s(x.phone, 40), email: s(x.email, 120) })).filter(x => x.name),
  };
  if (photo) out.photo = photo;
  return out;
}

/** "2010-04-17" → "17.04.2010" (de/fr) / "17 April 2010" stays as typed for anything else. */
function fmtDate(v: string, lang: CvLang): string {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return v;
  if (lang === "en") return new Date(`${v}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return `${m[3]}.${m[2]}.${m[1]}`;
}

const yearOf = (v?: string) => { const m = (v ?? "").match(/(19|20)\d{2}/); return m ? Number(m[0]) : null; };
const span = (from?: string, to?: string, today = "heute") => (from || to ? `${from || "?"} – ${to || today}` : "");

/** The CV as sections, in the usual order of a Swiss pupil CV. Empty sections are left out. */
export function buildSchoolCv(person: Person, profile: ProfileIn, lang: CvLang): SchoolCvModel {
  const l = L[lang];
  const cv = normalizeCvData(profile.cv);
  const personal: { label: string; value: string }[] = [];
  const address = [cv.street, cv.zipCity || s(person.location)].filter(Boolean).join(", ");
  if (address) personal.push({ label: l.address, value: address });
  if (s(person.phone)) personal.push({ label: l.phone, value: s(person.phone) });
  if (s(person.email)) personal.push({ label: l.email, value: s(person.email) });
  if (cv.birthDate) personal.push({ label: l.birth, value: fmtDate(cv.birthDate, lang) });
  if (cv.nationality) personal.push({ label: l.nationality, value: cv.nationality });

  const sections: CvSection[] = [];
  const add = (id: string, rows: CvRow[]) => { if (rows.length) sections.push({ id, title: l[id], rows }); };

  const schools = [...(cv.schools ?? [])].sort((a, b) => (yearOf(b.from) ?? 0) - (yearOf(a.from) ?? 0));
  add("school", schools.map(x => ({ when: span(x.from, x.to, l.today), what: x.name, detail: x.place })));

  const exps = profile.experiences ?? [];
  add("taster", exps.filter(e => e.kind === "schnupper").map(e => ({ what: e.title, detail: e.company })));
  add("experience", exps.filter(e => e.kind === "job" || e.kind === "verein" || e.kind === "schule" || e.kind === "anderes")
    .map(e => ({ when: l[e.kind], what: e.title, detail: e.company })));
  const wish = (profile.wishJobs ?? []).map(w => w.title).filter(Boolean);
  if (wish.length) add("wish", [{ what: wish.join(", ") }]);
  add("languages", (cv.languages ?? []).map(x => ({ what: x.name, detail: x.level ? l[x.level] : "" })));
  if (cv.it) add("it", [{ what: cv.it }]);
  const hobbies = [...exps.filter(e => e.kind === "hobby").map(e => e.title), ...(cv.hobbies ? [cv.hobbies] : [])];
  if (hobbies.length) add("hobbies", [{ what: hobbies.join(", ") }]);
  add("parents", (cv.parents ?? []).map(x => ({ what: x.name, detail: [x.job, x.phone].filter(Boolean).join(", ") })));
  add("references", (cv.references ?? []).map(x => ({ what: x.name, detail: [x.role, x.phone, x.email].filter(Boolean).join(", ") })));

  return { lang, title: l.title, name: s(person.name, 120), hasPhoto: !!cv.photo || /^https?:\/\//.test(s(person.photoUrl, 2000)), personal, sections };
}

// ─── Checklist (deterministic) ────────────────────────────────────────────

export type CvCheck = { id: string; status: "ok" | "warn" | "fail"; params?: Record<string, string | number> };

/** Nicknames that don't belong in an application e-mail address. */
const SILLY_MAIL = /(sexy|babe|baby|killer|cutie|princess|prinzessin|gangster|crazy|hottie|swag|xx|69|420|666|lol|noob|pro_?gamer|bitch|devil|teufel)/i;

export function schoolCvChecks(person: Person, profile: ProfileIn): CvCheck[] {
  const cv = normalizeCvData(profile.cv);
  const out: CvCheck[] = [];
  out.push({ id: "photo", status: cv.photo || /^https?:\/\//.test(s(person.photoUrl, 2000)) ? "ok" : "warn" });
  const missing = [
    !s(person.name) && "name", !s(person.phone) && "phone", !s(person.email) && "email",
    !(cv.street && (cv.zipCity || s(person.location))) && "address",
  ].filter(Boolean) as string[];
  out.push({ id: "contact", status: missing.length ? "fail" : "ok", params: { missing: missing.join(", ") } });
  out.push({ id: "birthDate", status: cv.birthDate ? "ok" : "fail" });
  const mail = s(person.email);
  if (mail) out.push({ id: "email", status: SILLY_MAIL.test(mail.split("@")[0]) ? "warn" : "ok", params: { email: mail } });

  const schools = cv.schools ?? [];
  if (!schools.length) out.push({ id: "schools", status: "fail" });
  else {
    const sorted = [...schools].filter(x => yearOf(x.from) != null).sort((a, b) => yearOf(a.from)! - yearOf(b.from)!);
    let gap = "";
    for (let i = 1; i < sorted.length; i++) {
      const end = yearOf(sorted[i - 1].to), start = yearOf(sorted[i].from);
      if (end != null && start != null && start - end > 1) { gap = `${end}–${start}`; break; }
    }
    const noDates = schools.some(x => !x.from);
    out.push({ id: "schools", status: gap || noDates ? "warn" : "ok", params: { gap, noDates: noDates ? 1 : 0 } });
  }
  const exps = profile.experiences ?? [];
  out.push({ id: "taster", status: exps.some(e => e.kind === "schnupper") ? "ok" : "warn" });
  out.push({ id: "languages", status: (cv.languages ?? []).length ? "ok" : "warn" });
  out.push({ id: "hobbies", status: exps.some(e => e.kind === "hobby") || cv.hobbies ? "ok" : "warn" });
  out.push({ id: "references", status: (cv.references ?? []).length ? "ok" : "warn" });
  const allText = JSON.stringify({ cv: { ...cv, photo: undefined }, exps, name: person.name });
  out.push({ id: "swiss", status: allText.includes("ß") ? "warn" : "ok" });
  if ((profile.tests ?? []).length) out.push({ id: "tests", status: "ok", params: { names: (profile.tests ?? []).map(t => t.name).join(", ") } });
  return out;
}

/** Plain-text CV for the Google Doc export. */
export function schoolCvText(m: SchoolCvModel): string {
  const lines: string[] = [m.title.toUpperCase(), "", m.name, ""];
  for (const p of m.personal) lines.push(`${p.label}: ${p.value}`);
  for (const sec of m.sections) {
    lines.push("", sec.title.toUpperCase());
    for (const r of sec.rows) lines.push([r.when, r.what, r.detail].filter(Boolean).join("  ·  "));
  }
  return lines.join("\n");
}

/** Characters the standard PDF fonts (WinAnsi) can't draw are replaced, so pdf-lib never throws. */
export function winAnsiSafe(text: string): string {
  const extra = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
  return text.normalize("NFC").replace(/[→⇒]/g, "->").replace(/\t/g, " ")
    .replace(/./gu, ch => { const c = ch.codePointAt(0)!; return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || extra.includes(ch) ? ch : "?"; });
}

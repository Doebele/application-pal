// Dates & reminders (phase 5c): application deadlines, taster days, interviews and personal
// dates (Multicheck, Stellwerk, Berufsmesse …) as one agenda with reminder days, an .ics export
// with alarms, and deadline detection for imported postings. Pure logic — routes live in index.ts.
// Self-check: npx tsx backend/src/school-dates.check.ts

export type AgendaLang = "de" | "en" | "fr";
export type PersonalDateKind = "test" | "fair" | "info" | "counselling" | "other";
export type PersonalDate = { id: string; kind: PersonalDateKind; title: string; date: string; time?: string; place?: string; note?: string };

export type AgendaKind = "deadline" | "taster" | "interview" | "personal" | "followup";
export type AgendaItem = {
  id: string;                 // stable: "<kind>:<appId>[:round]" or "personal:<id>"
  kind: AgendaKind;
  sub?: PersonalDateKind;     // personal dates only
  date: string;               // YYYY-MM-DD
  endDate?: string;           // taster days spanning several days
  time?: string;              // HH:MM
  title: string;              // company or personal title
  detail?: string;            // role / trade / place
  appId?: string;
  daysLeft: number;           // days from today to `date` (negative = past; for ranges: 0 while running)
  urgency: "overdue" | "today" | "soon" | "later";
  remind: boolean;            // today is one of the reminder days
};

/** The fields of an application the agenda reads (a subset of the DB row). */
export type AgendaApp = {
  id: string; company: string; role?: string | null; stage: string; archived?: string | null;
  applicationKind?: string | null; apprenticeship?: string | null; applyDeadline?: string | null;
  interview1Details?: string | null; interview2Details?: string | null; aiResultsCache?: string | null;
};

const PERSONAL_KINDS: PersonalDateKind[] = ["test", "fair", "info", "counselling", "other"];
const SENT_OR_LATER = new Set(["application_sent", "pending", "interview_1", "interview_2", "rejected", "accepted"]);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/** Days before an event on which a reminder is due (0 = the day itself). */
export const REMIND_DAYS: Record<AgendaKind | `personal:${PersonalDateKind}`, number[]> = {
  deadline: [7, 3, 1, 0],
  taster: [3, 1, 0],
  interview: [1, 0],
  followup: [0],
  personal: [1, 0],
  "personal:test": [7, 1, 0],
  "personal:fair": [3, 0],
  "personal:info": [1, 0],
  "personal:counselling": [1, 0],
  "personal:other": [1, 0],
};

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function normalizePersonalDates(raw: unknown): PersonalDate[] {
  if (!Array.isArray(raw)) return [];
  const out: PersonalDate[] = [];
  for (const x of raw.slice(0, 100)) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const date = str(o.date, 10);
    if (!isIsoDate(date)) continue;
    const kind = PERSONAL_KINDS.includes(o.kind as PersonalDateKind) ? (o.kind as PersonalDateKind) : "other";
    const time = str(o.time, 5);
    out.push({
      id: str(o.id, 40) || `${date}-${out.length}`,
      kind, title: str(o.title, 120), date,
      ...(TIME.test(time) ? { time } : {}),
      ...(str(o.place, 120) ? { place: str(o.place, 120) } : {}),
      ...(str(o.note, 400) ? { note: str(o.note, 400) } : {}),
    });
  }
  return out;
}

function json(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try { const j = JSON.parse(raw); return j && typeof j === "object" ? j : {}; } catch { return {}; }
}

function urgencyOf(daysLeft: number): AgendaItem["urgency"] {
  return daysLeft < 0 ? "overdue" : daysLeft === 0 ? "today" : daysLeft <= 7 ? "soon" : "later";
}

/**
 * Builds the agenda for `today` (YYYY-MM-DD, the client's local date).
 * - Deadline: only while the application has not been sent; shown up to 14 days overdue.
 * - Taster days (Schnupperlehre, interview round 1, optional endDate): until the last day.
 * - Interviews: from today on (round 2 of a Schnupperlehre = the feedback talk).
 * - Follow-up: a Schnupperlehre whose taster days ended 0–7 days ago and has no debrief yet.
 * - Personal dates: from yesterday on.
 * Archived applications never appear. Items further than `horizon` days away are dropped.
 */
export function buildAgenda(apps: AgendaApp[], personal: PersonalDate[], today: string, horizon = 180): AgendaItem[] {
  const items: AgendaItem[] = [];
  const push = (it: Omit<AgendaItem, "daysLeft" | "urgency" | "remind">, remindKey: keyof typeof REMIND_DAYS) => {
    let daysLeft = dayDiff(today, it.date);
    if (it.endDate && daysLeft < 0 && dayDiff(today, it.endDate) >= 0) daysLeft = 0;   // running range
    if (daysLeft > horizon) return;
    items.push({ ...it, daysLeft, urgency: urgencyOf(daysLeft), remind: REMIND_DAYS[remindKey].includes(daysLeft) });
  };

  for (const a of apps) {
    if (a.archived === "true") continue;
    const taster = a.applicationKind === "schnupperlehre";
    const detail = (a.apprenticeship || a.role || "").trim() || undefined;

    if (isIsoDate(a.applyDeadline) && !SENT_OR_LATER.has(a.stage) && dayDiff(today, a.applyDeadline) >= -14)
      push({ id: `deadline:${a.id}`, kind: "deadline", date: a.applyDeadline, title: a.company, detail, appId: a.id }, "deadline");

    for (const round of [1, 2] as const) {
      const d = json(round === 1 ? a.interview1Details : a.interview2Details);
      if (!isIsoDate(d.date)) continue;
      const time = TIME.test(str(d.time, 5)) ? str(d.time, 5) : undefined;
      if (taster && round === 1) {
        const end = isIsoDate(d.endDate) && d.endDate >= d.date ? d.endDate : undefined;
        const last = end ?? d.date;
        if (dayDiff(today, last) >= 0)
          push({ id: `taster:${a.id}`, kind: "taster", date: d.date, ...(end ? { endDate: end } : {}), ...(time ? { time } : {}), title: a.company, detail, appId: a.id }, "taster");
        const since = -dayDiff(today, last);
        const debrief = json(a.aiResultsCache)["schnupper-debrief"];
        if (since >= 1 && since <= 7 && !debrief && a.stage !== "rejected" && a.stage !== "accepted")
          push({ id: `followup:${a.id}`, kind: "followup", date: today, title: a.company, detail, appId: a.id }, "followup");
      } else if (dayDiff(today, d.date) >= 0) {
        push({ id: `interview:${a.id}:${round}`, kind: "interview", date: d.date, ...(time ? { time } : {}), title: a.company, detail, appId: a.id }, "interview");
      }
    }
  }

  for (const p of personal) {
    if (dayDiff(today, p.date) < -1) continue;
    push({ id: `personal:${p.id}`, kind: "personal", sub: p.kind, date: p.date, ...(p.time ? { time: p.time } : {}), title: p.title, ...(p.place ? { detail: p.place } : {}) },
      `personal:${p.kind}`);
  }

  const order: Record<AgendaKind, number> = { followup: 0, deadline: 1, taster: 2, interview: 3, personal: 4 };
  return items.sort((x, y) => x.daysLeft - y.daysLeft || (x.time ?? "").localeCompare(y.time ?? "") || order[x.kind] - order[y.kind]);
}

// ─── .ics export ───────────────────────────────────────────────────────────────

const ICS_LABELS: Record<AgendaLang, Record<AgendaKind | PersonalDateKind, string>> = {
  de: { deadline: "Bewerbungsfrist", taster: "Schnuppertage", interview: "Vorstellungsgespräch", followup: "Danke sagen & Rückmeldung eintragen", personal: "Termin",
        test: "Test", fair: "Berufsmesse", info: "Infoveranstaltung", counselling: "Berufsberatung", other: "Termin" },
  en: { deadline: "Application deadline", taster: "Taster days", interview: "Interview", followup: "Say thanks & note your feedback", personal: "Appointment",
        test: "Test", fair: "Career fair", info: "Information event", counselling: "Career counselling", other: "Appointment" },
  fr: { deadline: "Délai de candidature", taster: "Stage d'observation", interview: "Entretien", followup: "Remercier & noter ton retour", personal: "Rendez-vous",
        test: "Test", fair: "Salon des métiers", info: "Séance d'information", counselling: "Orientation professionnelle", other: "Rendez-vous" },
};

export function agendaLabel(item: AgendaItem, lang: AgendaLang): string {
  const l = ICS_LABELS[lang];
  if (item.kind === "personal") return item.title ? `${l[item.sub ?? "other"]}: ${item.title}` : l[item.sub ?? "other"];
  return `${l[item.kind]}: ${item.title}`;
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds a content line at 74 UTF-16 units (close enough for the short lines written here). */
function fold(line: string): string {
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += 74) parts.push((i ? " " : "") + line.slice(i, i + 74));
  return parts.join("\r\n");
}

const compact = (d: string) => d.replace(/-/g, "");
function addDays(d: string, n: number): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * An iCalendar file with one event per agenda item and alarms on its reminder days
 * (09:00 local time for all-day items; for timed items the day before and 2 h before).
 * Follow-up nudges and overdue items are left out — a calendar holds future dates.
 */
export function agendaIcs(items: AgendaItem[], lang: AgendaLang, appName: string, stamp: Date = new Date()): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${appName}//Termine//${lang.toUpperCase()}`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(appName)}`];
  for (const it of items) {
    if (it.kind === "followup" || it.urgency === "overdue") continue;
    const remindKey = (it.kind === "personal" ? `personal:${it.sub ?? "other"}` : it.kind) as keyof typeof REMIND_DAYS;
    lines.push("BEGIN:VEVENT", `UID:${it.id.replace(/[^\w:.-]/g, "")}@application-pal`, `DTSTAMP:${dtstamp}`);
    if (it.time && !it.endDate) {
      const start = `${compact(it.date)}T${it.time.replace(":", "")}00`;
      const endH = Math.min(23, Number(it.time.slice(0, 2)) + 1);
      lines.push(`DTSTART:${start}`, `DTEND:${compact(it.date)}T${String(endH).padStart(2, "0")}${it.time.slice(3)}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compact(it.date)}`, `DTEND;VALUE=DATE:${compact(addDays(it.endDate ?? it.date, 1))}`);
    }
    lines.push(`SUMMARY:${icsEscape(agendaLabel(it, lang))}`);
    if (it.detail) lines.push(`DESCRIPTION:${icsEscape(it.detail)}`);
    const alarms = it.time && !it.endDate ? ["-P1D", "-PT2H"]
      : REMIND_DAYS[remindKey].map(n => (n === 0 ? "PT9H" : `-P${n - 1}DT15H`));   // 09:00 n days before
    for (const trigger of alarms) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(agendaLabel(it, lang))}`, `TRIGGER:${trigger}`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// ─── Deadline detection for imported postings ─────────────────────────────────

const MONTHS: Record<string, number> = {
  januar: 1, jan: 1, january: 1, janvier: 1, janv: 1,
  februar: 2, feb: 2, february: 2, février: 2, fevrier: 2, févr: 2,
  märz: 3, maerz: 3, mär: 3, march: 3, mar: 3, mars: 3,
  april: 4, apr: 4, avril: 4, avr: 4,
  mai: 5, may: 5,
  juni: 6, jun: 6, june: 6, juin: 6,
  juli: 7, jul: 7, july: 7, juillet: 7, juil: 7,
  august: 8, aug: 8, août: 8, aout: 8,
  september: 9, sep: 9, sept: 9, septembre: 9,
  oktober: 10, okt: 10, october: 10, oct: 10, octobre: 10,
  november: 11, nov: 11, novembre: 11,
  dezember: 12, dez: 12, december: 12, dec: 12, décembre: 12, decembre: 12, déc: 12,
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

const CUE = /(bewerbungsfrist|bewerbungsschluss|einsendeschluss|anmeldeschluss|eingabefrist|bewirb dich (?:bitte )?bis|bewerbungen? (?:bitte )?bis|(?:bitte )?bis spätestens|deadline|apply (?:by|before|until)|application deadline|closing date|délai de (?:candidature|postulation)|postule[rz]? (?:avant|jusqu'au)|délai)/gi;

function toIso(y: number, m: number, d: number): string | null {
  const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isIsoDate(s) ? s : null;
}

/** Parses the first date in `s` (numeric or with a month name); a missing year = next occurrence from `today`. */
function firstDate(s: string, today: string): string | null {
  const ty = Number(today.slice(0, 4));
  const withYear = (d: number, m: number, y?: number) => {
    if (y != null) return toIso(y < 100 ? 2000 + y : y, m, d);
    const cand = toIso(ty, m, d);
    return cand && cand >= today ? cand : toIso(ty + 1, m, d);
  };
  const candidates: { at: number; iso: string | null }[] = [];
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) candidates.push({ at: iso.index!, iso: toIso(+iso[1], +iso[2], +iso[3]) });
  const num = s.match(/\b(\d{1,2})\.\s?(\d{1,2})\.(?:\s?(\d{4}|\d{2})\b)?/);
  if (num) candidates.push({ at: num.index!, iso: withYear(+num[1], +num[2], num[3] ? +num[3] : undefined) });
  const dm = s.match(new RegExp(`\\b(\\d{1,2})(?:\\.|er)?\\s+(${MONTH_RE})\\.?(?:\\s+(\\d{4}))?`, "i"));
  if (dm) candidates.push({ at: dm.index!, iso: withYear(+dm[1], MONTHS[dm[2].toLowerCase()], dm[3] ? +dm[3] : undefined) });
  const md = s.match(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?(?:\\s+(\\d{4}))?`, "i"));
  if (md) candidates.push({ at: md.index!, iso: withYear(+md[2], MONTHS[md[1].toLowerCase()], md[3] ? +md[3] : undefined) });
  const first = candidates.filter(c => c.iso).sort((a, b) => a.at - b.at)[0];
  return first?.iso ?? null;
}

/**
 * Finds an application deadline in a posting: a cue word ("Bewerbungsfrist", "bewirb dich bis",
 * "apply by", "délai de candidature" …) followed by a date within 40 characters.
 * Returns YYYY-MM-DD, or null when none is found or the date is already past.
 */
export function detectDeadline(text: string, today: string): string | null {
  for (const m of text.matchAll(CUE)) {
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 40);
    const date = firstDate(after, today);
    if (date) return date >= today ? date : null;
  }
  return null;
}

// Client side of the agenda (backend/src/school-dates.ts builds it): types, the local
// "today" the server needs (the container runs in UTC) and small formatting helpers.
import { format } from "date-fns";

export type AgendaKind = "deadline" | "taster" | "interview" | "personal" | "followup";
export type PersonalKind = "test" | "fair" | "info" | "counselling" | "other";
export type AgendaItem = {
  id: string; kind: AgendaKind; sub?: PersonalKind;
  date: string; endDate?: string; time?: string;
  title: string; detail?: string; appId?: string;
  daysLeft: number; urgency: "overdue" | "today" | "soon" | "later"; remind: boolean;
};

export const localToday = () => format(new Date(), "yyyy-MM-dd");

export function fmtDay(iso: string, lang: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat(lang, opts).format(new Date(`${iso}T12:00:00`));
}

/** Google Calendar "add event" link (no API scope needed — the user saves it themselves). */
export function googleCalendarLink(it: AgendaItem, label: string): string {
  const d = it.date.replace(/-/g, "");
  let dates: string;
  if (it.time && !it.endDate) {
    const [h, m] = it.time.split(":").map(Number);
    const end = `${String(Math.min(23, h + 1)).padStart(2, "0")}${String(m).padStart(2, "0")}`;
    dates = `${d}T${it.time.replace(":", "")}00/${d}T${end}00`;
  } else {
    const last = new Date(`${it.endDate ?? it.date}T12:00:00`);
    last.setDate(last.getDate() + 1);
    dates = `${d}/${format(last, "yyyyMMdd")}`;
  }
  const q = new URLSearchParams({ action: "TEMPLATE", text: label, dates, ...(it.detail ? { details: it.detail } : {}) });
  return `https://calendar.google.com/calendar/render?${q}`;
}

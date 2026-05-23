import { addMinutes, format, parseISO } from "date-fns";
import type { Application } from "@application-pal/shared";
import { type CalendarEvent, EVENT_COLORS } from "../types/calendar";
import { STAGE_COLORS as STAGE_COLORS_MAP, STAGE_LABELS_DE, ALL_STAGES } from "./stages";

// ─── Stage color lookup ───────────────────────────────────────
export function stageColor(stage: string): string {
  return STAGE_COLORS_MAP[stage] ?? EVENT_COLORS.other;
}

// ─── Stage labels (DE fallback — CalendarPage uses t() directly) ─
export const STAGE_LABELS: Record<string, string> = STAGE_LABELS_DE;
export { ALL_STAGES };

// ─── InterviewDetails JSON shape ─────────────────────────────
interface InterviewDetails {
  date?: string;
  time?: string;
  duration?: number;
  format?: "onsite" | "video" | "phone";
  location?: string;
  videoUrl?: string;
  videoCode?: string;
  videoProvider?: string;
  interviewer?: string;
  notes?: string;
}

// ─── Interview JSON → CalendarEvent ──────────────────────────
function parseInterviewEvent(app: Application, round: 1 | 2): CalendarEvent | null {
  const raw = round === 1 ? app.interview1Details : app.interview2Details;
  if (!raw) return null;
  let d: InterviewDetails;
  try { d = JSON.parse(raw); } catch { return null; }
  if (!d.date || !d.time) return null;

  const start = new Date(`${d.date}T${d.time}`);
  if (isNaN(start.getTime())) return null;
  const end = addMinutes(start, d.duration ?? 60);

  const formatLabel =
    d.format === "onsite" ? "Vor Ort" :
    d.format === "video"  ? (d.videoProvider ?? "Video") :
    d.format === "phone"  ? "Telefon" : "";

  const timeStr = format(start, "HH:mm");
  const descParts = [
    app.role,
    `Interview ${round}`,
    timeStr !== "00:00" ? timeStr : null,
    formatLabel || null,
    d.interviewer ? d.interviewer : null,
    d.location    ? d.location    : null,
  ].filter(Boolean);

  return {
    id:          `interview-${app.id}-${round}`,
    title:       app.company,
    start,
    end,
    type:        "interview",
    phase:       app.stage,
    source:      "local",
    color:       stageColor(app.stage),
    description: descParts.join(" · "),
    metadata:    { appId: app.id, company: app.company, role: app.role, stage: app.stage, round, details: d, matchScore: app.matchScore ?? null },
  };
}

// ─── nextDeadline → CalendarEvent ────────────────────────────
function parseDeadlineEvent(app: Application): CalendarEvent | null {
  if (!app.nextDeadline) return null;
  let start: Date;
  try {
    start = app.nextDeadline.includes("T") ? parseISO(app.nextDeadline) : new Date(app.nextDeadline);
    if (isNaN(start.getTime())) return null;
  } catch { return null; }

  return {
    id:          `deadline-${app.id}`,
    title:       app.company,
    start,
    type:        "deadline",
    phase:       app.stage,
    source:      "local",
    color:       EVENT_COLORS.deadline,
    description: app.role ? `Deadline · ${app.role}` : "Deadline",
    metadata:    { appId: app.id, company: app.company, role: app.role, stage: app.stage },
  };
}

// ─── application_activities row ──────────────────────────────
export interface ActivityRow {
  id: string;
  applicationId: string;
  type: string;
  title: string;
  description: string | null;
  activityDate: string;
  createdAt: string;
  company?: string | null;
  role?: string | null;
  stage?: string | null;
}

function activityTypeToEventType(type: string): CalendarEvent["type"] {
  switch (type) {
    case "interview": return "interview";
    case "deadline":  return "deadline";
    case "email":
    case "call":      return "follow-up";
    default:          return "timeline";
  }
}

export function activityRowsToCalendarEvents(rows: ActivityRow[]): CalendarEvent[] {
  return rows.map((row) => ({
    id:          `activity-${row.id}`,
    title:       row.title,
    start:       new Date(row.activityDate),
    type:        activityTypeToEventType(row.type),
    phase:       row.stage ?? "",
    source:      "local" as const,
    color:       row.stage ? stageColor(row.stage) : EVENT_COLORS[activityTypeToEventType(row.type)],
    description: [row.company, row.role].filter(Boolean).join(" · ") || row.description || undefined,
    metadata:    { appId: row.applicationId, company: row.company, role: row.role, stage: row.stage, actType: row.type },
  }));
}

// ─── Applications → CalendarEvents ───────────────────────────
export function applicationsToCalendarEvents(apps: Application[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const app of apps) {
    // Interview 1 & 2
    const i1 = parseInterviewEvent(app, 1);
    if (i1) events.push(i1);
    const i2 = parseInterviewEvent(app, 2);
    if (i2) events.push(i2);
    // Deadline
    const dl = parseDeadlineEvent(app);
    if (dl) events.push(dl);
    // Stage change (timeline)
    const updAt = new Date(app.updatedAt);
    const crAt  = new Date(app.createdAt);
    if (Math.abs(updAt.getTime() - crAt.getTime()) > 5000) {
      events.push({
        id:          `stage-${app.id}`,
        title:       app.company,
        start:       updAt,
        type:        "timeline",
        phase:       app.stage,
        source:      "local",
        color:       stageColor(app.stage),
        // No phase label — color encodes phase. Show role + date for context.
        description: app.role || undefined,
        metadata:    { appId: app.id, company: app.company, role: app.role, stage: app.stage, matchScore: app.matchScore ?? null },
      });
    }
    // Created event
    events.push({
      id:          `created-${app.id}`,
      title:       app.company,
      start:       crAt,
      type:        "timeline",
      phase:       app.stage,
      source:      "local",
      color:       stageColor(app.stage),
      description: app.role ? `Neu · ${app.role}` : "Neue Bewerbung",
      metadata:    { appId: app.id, company: app.company, role: app.role, stage: app.stage },
    });
  }
  return events;
}

// ─── Google Calendar event shape ─────────────────────────────
export interface GoogleCalendarItem {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  colorId?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end?:  { dateTime?: string; date?: string; timeZone?: string };
}

// Google Calendar colorId → hex (standard Google Calendar palette)
const GCal_COLORS: Record<string, string> = {
  "1": "#a4bdfc", "2": "#7ae7bf", "3": "#dbadff", "4": "#ff887c",
  "5": "#fbd75b", "6": "#ffb878", "7": "#46d6db", "8": "#e1e1e1",
  "9": "#5484ed", "10": "#51b749", "11": "#dc2127",
};

export function googleCalendarEventsToCalendarEvents(
  items: GoogleCalendarItem[],
  calendarColor = "#a855f7"
): CalendarEvent[] {
  return items.map((item) => {
    const startStr = item.start.dateTime ?? item.start.date ?? "";
    const endStr   = item.end?.dateTime   ?? item.end?.date;
    const start = new Date(startStr);
    const end   = endStr ? new Date(endStr) : undefined;
    const color = item.colorId ? GCal_COLORS[item.colorId] ?? calendarColor : calendarColor;

    return {
      id:          `gcal-${item.id}`,
      title:       item.summary ?? "(Ohne Titel)",
      start,
      end,
      type:        "google-doc" as const,  // visual bucket: purple = Google
      phase:       "google-calendar",
      source:      "google-drive" as const,
      color,
      description: [item.description, item.location].filter(Boolean).join(" · ") || undefined,
      metadata:    { gcalId: item.id, htmlLink: item.htmlLink, location: item.location },
    };
  });
}

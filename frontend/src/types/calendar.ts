// ─── Calendar Types ────────────────────────────────────────────

export type CalendarEventType =
  | "timeline"
  | "google-doc"
  | "interview"
  | "deadline"
  | "follow-up"
  | "other";

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end?: Date;
  type: CalendarEventType;
  /** Application stage or "google-calendar" for GCal events */
  phase: string;
  source: "local" | "google-drive";
  color: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface CalendarFilterState {
  /** event type filter — empty = show all */
  types: CalendarEventType[];
  /** stage/phase filter — empty = show all */
  phases: string[];
  view: "month" | "week";
  /** selected Google Calendar ID (empty = none imported) */
  googleCalendarId: string;
}

// Default color per event type (fallback if no stage color available)
export const EVENT_COLORS: Record<CalendarEventType, string> = {
  interview:    "#34d399",   // green (same as interview_1 stage)
  deadline:     "#ef4444",   // red
  "follow-up":  "#f59e0b",   // amber
  "google-doc": "#a855f7",   // purple
  timeline:     "#6b7280",   // neutral grey
  other:        "#6b7280",
};

export const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  interview:    "Interview",
  deadline:     "Deadline",
  "follow-up":  "Follow-up",
  "google-doc": "Google Kalender",
  timeline:     "Timeline",
  other:        "Sonstiges",
};

export const ALL_EVENT_TYPES: CalendarEventType[] = [
  "interview",
  "deadline",
  "follow-up",
  "google-doc",
  "timeline",
  "other",
];

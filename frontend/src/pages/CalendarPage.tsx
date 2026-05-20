import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  addDays, addMonths, addWeeks, format, getDay, getDaysInMonth,
  isSameDay, startOfWeek, subMonths, subWeeks,
} from "date-fns";
import { de } from "date-fns/locale";
import {
  NavArrowLeft, NavArrowRight, Xmark,
  Calendar, Check, RefreshDouble,
} from "iconoir-react";
import type { Application } from "@application-pal/shared";
import { api } from "../lib/api";
import { Topbar } from "../components/Topbar";
import { DetailDrawer } from "../components/DetailDrawer";
import {
  applicationsToCalendarEvents,
  activityRowsToCalendarEvents,
  googleCalendarEventsToCalendarEvents,
  stageColor,
  STAGE_LABELS,
  ALL_STAGES,
  type ActivityRow,
  type GoogleCalendarItem,
} from "../lib/calendarMapping";
import { useCalendarFilters } from "../hooks/useCalendarFilters";
import {
  ALL_EVENT_TYPES,
  EVENT_TYPE_LABELS,
  type CalendarEvent,
} from "../types/calendar";

// ─── Google Calendar list item ────────────────────────────────
interface GCalListItem {
  id: string;
  summary: string;
  backgroundColor?: string;
  primary?: boolean;
}

// ─── WCAG contrast helper ─────────────────────────────────────
// Returns #1a1a2e (near-black) or #ffffff depending on which gives
// ≥ 4.5:1 contrast ratio against the given hex background.
function contrastText(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "#1a1a2e";
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const lin = (c: number) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // Contrast vs white vs black
  const cW = 1.05 / (L + 0.05);
  const cB = (L + 0.05) / 0.05;
  return cB >= cW ? "#1a1a2e" : "#ffffff";
}

// ─── Popup state ──────────────────────────────────────────────
interface PopupState {
  event: CalendarEvent;
  x: number;
  y: number;
}

// ─── Floating popup (portal) ─────────────────────────────────
// Rendered into document.body so it escapes all overflow:hidden parents.
function FloatingPopup({
  popup, onClose, onOpenApp,
}: {
  popup: PopupState;
  onClose: () => void;
  onOpenApp: (appId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const appId    = popup.event.metadata?.appId as string | undefined;
  const htmlLink = popup.event.metadata?.htmlLink as string | undefined;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [onClose]);

  // Smart position: keep inside viewport
  const W = 270;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.min(popup.x, vw - W - 12);
  const top  = popup.y + 6 + (popup.y + 250 > vh ? -260 : 0);

  return createPortal(
    <div
      ref={ref}
      className="cal-popup"
      style={{ position: "fixed", left, top, width: W, zIndex: 9999 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
        <span style={{
          width: 10, height: 10, borderRadius: 3, background: popup.event.color,
          flexShrink: 0, marginTop: 3, border: "1px solid rgba(0,0,0,0.12)",
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-1)", lineHeight: 1.35, marginBottom: 2 }}>
            {popup.event.title}
          </div>
          <div style={{ fontSize: 10, color: "var(--fg-3)", fontFamily: "var(--font-mono)", lineHeight: 1.4 }}>
            {format(popup.event.start, "EEEE, dd. MMMM yyyy", { locale: de })}
            {popup.event.start.getHours() + popup.event.start.getMinutes() > 0 && (
              <>, {format(popup.event.start, "HH:mm")}
                {popup.event.end && ` – ${format(popup.event.end, "HH:mm")}`} Uhr</>
            )}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--fg-3)", padding: 2, flexShrink: 0,
        }}>
          <Xmark width={13} height={13} />
        </button>
      </div>

      {popup.event.description && (
        <div style={{
          fontSize: 11, color: "var(--fg-2)", lineHeight: 1.55,
          marginBottom: 10, paddingLeft: 18,
        }}>
          {popup.event.description}
        </div>
      )}

      {(appId || htmlLink) && (
        <div style={{ display: "flex", gap: 6, paddingLeft: 18, flexWrap: "wrap" }}>
          {appId && (
            <button
              className="btn btn-secondary"
              style={{ fontSize: 10, padding: "3px 10px" }}
              onClick={() => { onOpenApp(appId); onClose(); }}
            >
              Bewerbung öffnen →
            </button>
          )}
          {htmlLink && (
            <a href={htmlLink} target="_blank" rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ fontSize: 10, padding: "3px 10px", textDecoration: "none" }}
            >
              Google Kalender ↗
            </a>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}

// ─── Event pill ───────────────────────────────────────────────
// Uses tinted bg + left border so text is always dark → WCAG 4.5:1+
function EventPill({
  event,
  onSelect,
  weekView = false,
}: {
  event: CalendarEvent;
  onSelect: (ev: CalendarEvent, x: number, y: number) => void;
  weekView?: boolean;
}) {
  const color = event.color;
  const text  = contrastText(color); // only used if solid bg needed

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    // Position popup to the right of pill, or below if at right edge
    const x = rect.right + 8 < window.innerWidth - 280
      ? rect.right + 8
      : rect.left - 8;
    onSelect(event, x, rect.top);
  };

  const matchScore = event.metadata?.matchScore as number | null | undefined;

  return (
    <button
      className={`cal-event-pill${weekView ? " cal-event-pill-week" : ""}`}
      style={{
        background: `${color}1e`,      // ~12% opacity tint — WCAG safe
        borderLeft: `3px solid ${color}`,
        color: "var(--fg-1)",
      }}
      onClick={handleClick}
      title={`${event.title}${event.description ? "\n" + event.description : ""}`}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
        {matchScore != null && (
          <span className="cal-match-badge" style={{
            color: matchScore >= 75 ? "#22c55e" : matchScore >= 50 ? "#f59e0b" : "#f87171",
          }}>
            {matchScore}%
          </span>
        )}
        <span className="cal-pill-title" style={{ color: "var(--fg-1)", flex: 1, minWidth: 0 }}>
          {event.title}
        </span>
      </div>
      {event.description && (
        <span
          className="cal-pill-sub"
          style={{ WebkitLineClamp: weekView ? 3 : 1, color: "var(--fg-2)" }}
        >
          {event.description}
        </span>
      )}
    </button>
  );
}

// ─── Month view ───────────────────────────────────────────────
function MonthView({
  displayDate, events, onSelectEvent,
}: {
  displayDate: Date;
  events: CalendarEvent[];
  onSelectEvent: (ev: CalendarEvent, x: number, y: number) => void;
}) {
  const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const today = new Date();

  const firstDay = new Date(displayDate.getFullYear(), displayDate.getMonth(), 1);
  const daysInMonth = getDaysInMonth(displayDate);
  let startOffset = getDay(firstDay) - 1;
  if (startOffset < 0) startOffset = 6;

  const cells: (Date | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      new Date(displayDate.getFullYear(), displayDate.getMonth(), i + 1)
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = format(ev.start, "yyyy-MM-dd");
      map.set(key, [...(map.get(key) ?? []), ev]);
    }
    return map;
  }, [events]);

  return (
    <div className="cal-grid">
      {DAYS.map((d) => <div key={d} className="cal-day-header">{d}</div>)}
      {cells.map((day, i) => {
        const key = day ? format(day, "yyyy-MM-dd") : null;
        const dayEvents = (key ? eventsByDay.get(key) : null) ?? [];
        const isToday = day ? isSameDay(day, today) : false;

        return (
          <div
            key={i}
            className={`cal-day${!day ? " muted" : ""}${isToday ? " today" : ""}`}
          >
            {day && <div className="cal-day-num">{day.getDate()}</div>}
            {dayEvents.slice(0, 6).map((ev) => (
              <EventPill key={ev.id} event={ev} onSelect={onSelectEvent} />
            ))}
            {dayEvents.length > 6 && (
              <div className="cal-more">+{dayEvents.length - 6}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Week view ────────────────────────────────────────────────
function WeekView({
  displayDate, events, onSelectEvent,
}: {
  displayDate: Date;
  events: CalendarEvent[];
  onSelectEvent: (ev: CalendarEvent, x: number, y: number) => void;
}) {
  const today = new Date();
  const weekStart = startOfWeek(displayDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = format(ev.start, "yyyy-MM-dd");
      map.set(key, [...(map.get(key) ?? []), ev]);
    }
    return map;
  }, [events]);

  return (
    <div className="cal-week-grid">
      {days.map((day) => {
        const key = format(day, "yyyy-MM-dd");
        const dayEvents = eventsByDay.get(key) ?? [];
        const isToday = isSameDay(day, today);

        return (
          <div key={key} className="cal-week-col">
            {/* Day header */}
            <div className="cal-week-day-header">
              <span className="cal-week-day-name">
                {format(day, "EEE", { locale: de })}
              </span>
              <span className={`cal-week-day-num${isToday ? " today" : ""}`}>
                {day.getDate()}
              </span>
            </div>

            {/* Events — full width, up to 4 lines of content */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {dayEvents.map((ev) => (
                <EventPill
                  key={ev.id}
                  event={ev}
                  onSelect={onSelectEvent}
                  weekView
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Google Calendar connect panel ───────────────────────────
function GoogleCalendarPanel({
  status, calendars, selectedId, onSelect, onRefresh,
}: {
  status: { connected: boolean; hasCalendarScope: boolean } | undefined;
  calendars: GCalListItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  if (!status?.connected) return null;

  if (!status.hasCalendarScope) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Calendar width={13} height={13} style={{ color: "var(--fg-3)" }} />
        <span style={{ fontSize: 11, color: "var(--fg-3)" }}>
          Kalender-Zugriff fehlt —
        </span>
        <a href="/settings" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>
          Google neu verbinden
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <Calendar width={13} height={13} style={{ color: "#a855f7", flexShrink: 0 }} />
      <select
        value={selectedId || ""}
        onChange={(e) => onSelect(e.target.value)}
        style={{
          fontSize: 11, padding: "2px 6px", borderRadius: 6,
          border: "1px solid var(--border)", background: "var(--surface)",
          color: selectedId ? "var(--fg-1)" : "var(--fg-3)",
          cursor: "pointer", fontFamily: "var(--font-sans)",
        }}
      >
        <option value="">— Google Kalender —</option>
        {calendars.map((cal) => (
          <option key={cal.id} value={cal.id}>
            {cal.primary ? "Primärer Kalender" : cal.summary}
          </option>
        ))}
      </select>
      {selectedId && (
        <>
          <button onClick={onRefresh}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", padding: 2 }}
            title="Aktualisieren">
            <RefreshDouble width={12} height={12} />
          </button>
          <Check width={12} height={12} style={{ color: "#a855f7" }} />
        </>
      )}
    </div>
  );
}

// ─── Filter section ───────────────────────────────────────────
function FilterSection({
  filters, onToggleType, onTogglePhase, onClear, hasActive,
}: {
  filters: ReturnType<typeof useCalendarFilters>["state"];
  onToggleType: (t: CalendarEvent["type"]) => void;
  onTogglePhase: (p: string) => void;
  onClear: () => void;
  hasActive: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {/* Type chips */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        <span className="eyebrow" style={{ marginRight: 2 }}>Typ</span>
        {ALL_EVENT_TYPES.map((type) => {
          const active = filters.types.includes(type);
          return (
            <button key={type} onClick={() => onToggleType(type)} style={{
              fontSize: 10, fontWeight: 600, padding: "2px 9px",
              borderRadius: 99, border: "1px solid",
              borderColor: active ? "var(--accent)" : "var(--border)",
              background: active ? "var(--accent)" : "transparent",
              color: active ? "#fff" : "var(--fg-3)",
              cursor: "pointer", fontFamily: "var(--font-sans)",
              transition: "all 0.12s ease",
            }}>
              {EVENT_TYPE_LABELS[type]}
            </button>
          );
        })}
      </div>

      {/* Phase chips */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        <span className="eyebrow" style={{ marginRight: 2 }}>Phase</span>
        {ALL_STAGES.map((stage) => {
          const active = filters.phases.includes(stage);
          const color  = stageColor(stage);
          const tc     = active ? contrastText(color) : "var(--fg-2)";
          return (
            <button key={stage} onClick={() => onTogglePhase(stage)} style={{
              fontSize: 10, fontWeight: 600, padding: "2px 9px",
              borderRadius: 99, border: "1px solid",
              borderColor: active ? color : "var(--border)",
              background: active ? color : "transparent",
              color: tc,
              cursor: "pointer", fontFamily: "var(--font-sans)",
              transition: "all 0.12s ease",
            }}>
              {STAGE_LABELS[stage]}
            </button>
          );
        })}
      </div>

      {hasActive && (
        <button onClick={onClear} style={{
          fontSize: 10, padding: "2px 8px", borderRadius: 99,
          border: "1px solid var(--border)", background: "var(--surface-2)",
          color: "var(--fg-3)", cursor: "pointer", fontFamily: "var(--font-sans)",
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <Xmark width={9} height={9} /> löschen
        </button>
      )}
    </div>
  );
}

// ─── Main CalendarPage ────────────────────────────────────────
export function CalendarPage() {
  const { data: applications = [] } = useQuery<Application[]>({
    queryKey: ["applications"],
    queryFn: () => api.get("/api/applications").then((r) => r.data),
  });

  const [displayDate, setDisplayDate]   = useState(new Date());
  const [popup, setPopup]               = useState<PopupState | null>(null);
  const [selectedApp, setSelectedApp]   = useState<Application | null>(null);
  const [gcalRefreshKey, setGcalRefreshKey] = useState(0);

  const {
    state: filters, setView, toggleType, togglePhase,
    clearFilters, setGoogleCalendarId, filterEvents, hasActiveFilter,
  } = useCalendarFilters();

  // Date range
  const weekStart = startOfWeek(displayDate, { weekStartsOn: 1 });
  const fromDate = format(
    filters.view === "month"
      ? new Date(displayDate.getFullYear(), displayDate.getMonth(), 1)
      : weekStart,
    "yyyy-MM-dd"
  );
  const toDate = format(
    filters.view === "month"
      ? new Date(displayDate.getFullYear(), displayDate.getMonth() + 1, 0)
      : addDays(weekStart, 6),
    "yyyy-MM-dd"
  );

  const { data: activityRows = [] } = useQuery<ActivityRow[]>({
    queryKey: ["cal-activities", fromDate, toDate],
    queryFn: () =>
      api.get<ActivityRow[]>(`/api/calendar/events?from=${fromDate}&to=${toDate}`).then((r) => r.data),
  });

  const { data: gcalStatus } = useQuery<{ connected: boolean; hasCalendarScope: boolean }>({
    queryKey: ["gcal-status"],
    queryFn: () => api.get("/api/google/calendar/status").then((r) => r.data),
  });

  const { data: gcalList = [] } = useQuery<GCalListItem[]>({
    queryKey: ["gcal-list"],
    queryFn: () => api.get<GCalListItem[]>("/api/google/calendar/list").then((r) => r.data),
    enabled: !!(gcalStatus?.hasCalendarScope),
    retry: false,
  });

  const { data: gcalEvents = [] } = useQuery<GoogleCalendarItem[]>({
    queryKey: ["gcal-events", filters.googleCalendarId, fromDate, toDate, gcalRefreshKey],
    queryFn: () =>
      api.get<GoogleCalendarItem[]>(
        `/api/google/calendar/events?calendarId=${encodeURIComponent(filters.googleCalendarId)}&from=${fromDate}&to=${toDate}`
      ).then((r) => r.data),
    enabled: !!(filters.googleCalendarId && gcalStatus?.hasCalendarScope),
    retry: false,
  });

  const selectedCalColor = gcalList.find((c) => c.id === filters.googleCalendarId)?.backgroundColor ?? "#a855f7";

  const allEvents = useMemo(() => {
    const fromApps       = applicationsToCalendarEvents(applications);
    const fromActivities = activityRowsToCalendarEvents(activityRows);
    const fromGcal       = googleCalendarEventsToCalendarEvents(gcalEvents, selectedCalColor);
    const seen = new Set<string>();
    const merged: CalendarEvent[] = [];
    for (const ev of [...fromActivities, ...fromApps, ...fromGcal]) {
      if (!seen.has(ev.id)) { seen.add(ev.id); merged.push(ev); }
    }
    return merged;
  }, [applications, activityRows, gcalEvents, selectedCalColor]);

  const visibleEvents = useMemo(() => filterEvents(allEvents), [allEvents, filterEvents]);

  // Navigation
  const prev = useCallback(() => {
    setDisplayDate((d) => filters.view === "month" ? subMonths(d, 1) : subWeeks(d, 1));
    setPopup(null);
  }, [filters.view]);

  const next = useCallback(() => {
    setDisplayDate((d) => filters.view === "month" ? addMonths(d, 1) : addWeeks(d, 1));
    setPopup(null);
  }, [filters.view]);

  const goToday = useCallback(() => { setDisplayDate(new Date()); setPopup(null); }, []);

  // Open DetailDrawer for app events
  const handleOpenApp = useCallback((appId: string) => {
    const app = applications.find((a) => a.id === appId);
    if (app) setSelectedApp(app);
  }, [applications]);

  const handleSelectEvent = useCallback((ev: CalendarEvent, x: number, y: number) => {
    setPopup((prev) => prev?.event.id === ev.id ? null : { event: ev, x, y });
  }, []);

  const navLabel = filters.view === "month"
    ? format(displayDate, "MMMM yyyy", { locale: de })
    : (() => {
        const ws = startOfWeek(displayDate, { weekStartsOn: 1 });
        return `${format(ws, "dd. MMM", { locale: de })} – ${format(addDays(ws, 6), "dd. MMM yyyy", { locale: de })}`;
      })();

  return (
    <>
      <Topbar
        title="Kalender"
        actions={
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {/* Month / Week toggle */}
            <div style={{ display: "flex", gap: 1, background: "var(--surface-2)", borderRadius: 8, padding: 2 }}>
              {(["month", "week"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 12px", borderRadius: 6,
                  border: "none", cursor: "pointer", fontFamily: "var(--font-sans)",
                  background: filters.view === v ? "var(--surface)" : "transparent",
                  color: filters.view === v ? "var(--fg-1)" : "var(--fg-3)",
                  boxShadow: filters.view === v ? "var(--shadow-card)" : "none",
                  transition: "all 0.12s ease",
                }}>
                  {v === "month" ? "Monat" : "Woche"}
                </button>
              ))}
            </div>
            <button className="btn btn-secondary" onClick={prev}>
              <NavArrowLeft width={14} height={14} />
            </button>
            <button onClick={goToday} style={{
              fontSize: 11, fontWeight: 600, padding: "4px 16px",
              border: "1px solid var(--border)", borderRadius: 6,
              background: "transparent", color: "var(--fg-2)",
              cursor: "pointer", fontFamily: "var(--font-sans)",
              minWidth: 155, textAlign: "center",
            }}>
              {navLabel}
            </button>
            <button className="btn btn-secondary" onClick={next}>
              <NavArrowRight width={14} height={14} />
            </button>
          </div>
        }
      />

      {/* Dismiss popup on page click */}
      <div
        className="page-content"
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
        onClick={() => setPopup(null)}
      >
        {/* Google Calendar row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <GoogleCalendarPanel
            status={gcalStatus}
            calendars={gcalList}
            selectedId={filters.googleCalendarId}
            onSelect={setGoogleCalendarId}
            onRefresh={() => setGcalRefreshKey((k) => k + 1)}
          />
          {visibleEvents.length > 0 && (
            <span style={{ fontSize: 10, color: "var(--fg-3)" }}>
              {visibleEvents.length} Event{visibleEvents.length !== 1 ? "s" : ""}
              {hasActiveFilter ? " (gefiltert)" : ""}
            </span>
          )}
        </div>

        {/* Filters */}
        <FilterSection
          filters={filters}
          onToggleType={toggleType}
          onTogglePhase={togglePhase}
          onClear={clearFilters}
          hasActive={hasActiveFilter}
        />

        {/* Calendar */}
        {filters.view === "month" ? (
          <MonthView
            displayDate={displayDate}
            events={visibleEvents}
            onSelectEvent={handleSelectEvent}
          />
        ) : (
          <WeekView
            displayDate={displayDate}
            events={visibleEvents}
            onSelectEvent={handleSelectEvent}
          />
        )}

        {visibleEvents.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 0", color: "var(--fg-3)", fontSize: 13 }}>
            {hasActiveFilter
              ? "Keine Events für den gewählten Filter in diesem Zeitraum."
              : "Keine Events in diesem Zeitraum. Füge Interviewtermine oder Deadlines im Prozess-Tab hinzu."}
          </div>
        )}
      </div>

      {/* Floating popup — portaled to body, escapes all overflow:hidden */}
      {popup && (
        <FloatingPopup
          popup={popup}
          onClose={() => setPopup(null)}
          onOpenApp={handleOpenApp}
        />
      )}

      {/* DetailDrawer for application events */}
      {selectedApp && (
        <DetailDrawer
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
        />
      )}
    </>
  );
}

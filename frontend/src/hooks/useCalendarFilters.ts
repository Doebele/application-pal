import { useSearchParams } from "react-router-dom";
import type { CalendarEvent, CalendarEventType, CalendarFilterState } from "../types/calendar";

export function useCalendarFilters() {
  const [params, setParams] = useSearchParams();

  const state: CalendarFilterState = {
    view:             (params.get("view") as "month" | "week") ?? "month",
    types:            (params.get("types")?.split(",").filter(Boolean) as CalendarEventType[]) ?? [],
    phases:           params.get("phases")?.split(",").filter(Boolean) ?? [],
    googleCalendarId: params.get("gcal") ?? "",
  };

  const setView = (view: "month" | "week") =>
    setParams((p) => { p.set("view", view); return p; }, { replace: true });

  const toggleType = (type: CalendarEventType) =>
    setParams((p) => {
      const cur = (p.get("types")?.split(",").filter(Boolean) ?? []) as CalendarEventType[];
      const next = cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type];
      next.length ? p.set("types", next.join(",")) : p.delete("types");
      return p;
    }, { replace: true });

  const togglePhase = (phase: string) =>
    setParams((p) => {
      const cur = p.get("phases")?.split(",").filter(Boolean) ?? [];
      const next = cur.includes(phase) ? cur.filter((ph) => ph !== phase) : [...cur, phase];
      next.length ? p.set("phases", next.join(",")) : p.delete("phases");
      return p;
    }, { replace: true });

  const clearFilters = () =>
    setParams((p) => { p.delete("types"); p.delete("phases"); return p; }, { replace: true });

  const setGoogleCalendarId = (id: string) =>
    setParams((p) => { id ? p.set("gcal", id) : p.delete("gcal"); return p; }, { replace: true });

  const filterEvents = (events: CalendarEvent[]): CalendarEvent[] => {
    let result = events;
    if (state.types.length > 0) {
      result = result.filter((e) => state.types.includes(e.type));
    }
    if (state.phases.length > 0) {
      result = result.filter((e) => state.phases.includes(e.phase));
    }
    return result;
  };

  const hasActiveFilter = state.types.length > 0 || state.phases.length > 0;

  return { state, setView, toggleType, togglePhase, clearFilters, setGoogleCalendarId, filterEvents, hasActiveFilter };
}

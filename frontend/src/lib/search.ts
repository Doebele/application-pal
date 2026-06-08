import { useState, useEffect } from "react";
import type { Application } from "@application-pal/shared";

/**
 * Case-insensitive substring search across the most useful application fields.
 * Tags are stored as a JSON array and are joined before matching.
 */
export function matchesSearch(app: Application, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  const tags = (() => {
    try { return (JSON.parse(app.tags ?? "[]") as string[]).join(" "); }
    catch { return ""; }
  })();
  return [app.company, app.role, app.location, app.source, app.salary, app.notes, tags]
    .some(f => f?.toLowerCase().includes(q));
}

/**
 * Cycles through placeholder suggestions at a fixed interval.
 * Pauses when `paused` is true (e.g. while the input is focused).
 */
export function useRotatingPlaceholder(
  suggestions: string[],
  paused = false,
  intervalMs = 3000
): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (paused || suggestions.length <= 1) return;
    const id = setInterval(() => setI(n => (n + 1) % suggestions.length), intervalMs);
    return () => clearInterval(id);
  }, [paused, suggestions.length, intervalMs]);
  return suggestions[Math.min(i, suggestions.length - 1)] ?? "";
}

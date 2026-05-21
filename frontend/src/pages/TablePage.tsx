import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Extend TanStack Table column meta with tooltip helper
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    tooltip?: (row: TData) => string | undefined;
  }
}
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type VisibilityState,
  type ColumnOrderState,
  type ColumnPinningState,
  type ColumnSizingState,
} from "@tanstack/react-table";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import type { Application } from "@application-pal/shared";
import { api } from "../lib/api";
import { useUiStore } from "../lib/store";
import { NavArrowUp, NavArrowDown, Settings, Xmark, Search, Drag, Sparks, Refresh, RefreshCircle, Pin, PinSlash } from "iconoir-react";
import { DetailDrawer } from "../components/DetailDrawer";

// ── Constants ────────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  import_validating: "#94a3b8", preparing_cv: "#60a5fa", preparing_letter: "#22d3ee",
  application_sent: "#a78bfa", pending: "#fbbf24", interview_1: "#34d399",
  interview_2: "#10b981", rejected: "#f87171", accepted: "#84cc16"
};

const STAGE_LABELS: Record<string, string> = {
  import_validating: "Inbox",    preparing_cv: "CV",         preparing_letter: "Letter",
  application_sent:  "Sent",     pending:       "Pending",    interview_1: "1st Itw",
  interview_2:       "2nd Itw",  rejected:      "Rejected",   accepted: "Contract offer",
};

const SOURCE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn", indeed: "Indeed", direct: "Direct",
  xing: "XING", stepstone: "StepStone",
};

const DEFAULT_VISIBLE: VisibilityState = {
  company: true, role: true, stage: true, location: true,
  matchScore: true, salaryMedian: true, glassdoor: true, kununu: true,
  salary: false, source: false, tags: false, appliedAt: true,
  interview1: false, createdAt: false, updatedAt: false,
};

const DEFAULT_ORDER = [
  "company","role","stage","location","matchScore","salaryMedian",
  "glassdoor","kununu","salary","source","tags","appliedAt",
  "interview1","createdAt","updatedAt",
];

// ── Data helpers ─────────────────────────────────────────────────────────────

function getSalaryMedian(app: Application): number | null {
  try {
    const cache = JSON.parse((app as Application & { aiResultsCache?: string }).aiResultsCache ?? "{}");
    return (cache["salary-check"] as { lohnband?: { median?: number } } | undefined)?.lohnband?.median ?? null;
  } catch { return null; }
}

function getGlassdoorRating(app: Application): number | null {
  try { return (JSON.parse((app as Application & { glassdoorData?: string }).glassdoorData ?? "null") as { rating?: number } | null)?.rating ?? null; } catch { return null; }
}

function getKununuRating(app: Application): number | null {
  try { return (JSON.parse((app as Application & { kununuData?: string }).kununuData ?? "null") as { rating?: number } | null)?.rating ?? null; } catch { return null; }
}

function getInterview1Date(app: Application): string | null {
  try { return (JSON.parse((app as Application & { interview1Details?: string }).interview1Details ?? "null") as { date?: string } | null)?.date ?? null; } catch { return null; }
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return raw.split(",").map(t => t.trim()).filter(Boolean); }
}

function getCompanyColor(company: string): string {
  let hash = 0;
  for (let i = 0; i < company.length; i++) hash = company.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 50%)`;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// ── AI cell run button ────────────────────────────────────────────────────────

function RunAiButton({ appId, endpoint, hasValue }: {
  appId: string;
  endpoint: string;    // e.g. "/match-score" or "/ai/glassdoor-check"
  hasValue: boolean;
}) {
  const { ai } = useUiStore();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);

  if (ai.provider === "none") return null;

  const run = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRunning(true);
    try {
      await api.post(`/api/applications/${appId}${endpoint}`, {
        ai: { provider: ai.provider, anthropicApiKey: ai.anthropicApiKey, lmStudioUrl: ai.lmStudioUrl, lmStudioModel: ai.lmStudioModel },
      });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    } catch { /* silent */ }
    finally { setRunning(false); }
  };

  return (
    <button
      onClick={run}
      disabled={running}
      title={hasValue ? "Neu analysieren" : "Analysieren"}
      style={{
        background: "none", border: "none", cursor: running ? "default" : "pointer",
        padding: 0, display: "inline-flex", alignItems: "center", flexShrink: 0,
        color: hasValue ? "var(--fg-4)" : "var(--accent)",
        opacity: running ? 1 : 0.6,
        transition: "opacity 0.15s, color 0.15s",
      }}
      onMouseEnter={e => { if (!running) e.currentTarget.style.opacity = "1"; }}
      onMouseLeave={e => { if (!running) e.currentTarget.style.opacity = "0.6"; }}
    >
      {running
        ? <RefreshCircle width={11} height={11} style={{ animation: "spin 1s linear infinite" }} />
        : hasValue
          ? <Refresh width={10} height={10} />
          : <Sparks width={11} height={11} />
      }
    </button>
  );
}

// ── Column helper ─────────────────────────────────────────────────────────────

const ch = createColumnHelper<Application>();

// ── Main component ────────────────────────────────────────────────────────────

export function TablePage() {
  const {
    tableColumnOrder, tableColumnVisibility, tableColumnPinning, tableColumnSizing,
    setTableColumnOrder, setTableColumnVisibility, setTableColumnPinning, setTableColumnSizing,
  } = useUiStore();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [stageOpen, setStageOpen] = useState(false);
  const [colPanelOpen, setColPanelOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [hoveredColId, setHoveredColId] = useState<string | null>(null);
  const colPanelRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const { data: apps = [] } = useQuery<Application[]>({
    queryKey: ["applications"],
    queryFn: () => api.get("/api/applications").then(r => r.data),
  });

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colPanelRef.current && !colPanelRef.current.contains(e.target as Node)) setColPanelOpen(false);
      if (stageRef.current && !stageRef.current.contains(e.target as Node)) setStageOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Filtered data
  const filtered = useMemo(() => {
    let data = apps.filter(a => !(a as Application & { archived?: string }).archived || (a as Application & { archived?: string }).archived === "false");
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(a => a.company?.toLowerCase().includes(q) || a.role?.toLowerCase().includes(q) || a.location?.toLowerCase().includes(q));
    }
    if (stageFilter.length > 0) {
      data = data.filter(a => stageFilter.includes(a.stage ?? ""));
    }
    return data;
  }, [apps, search, stageFilter]);

  // Column definitions
  const columns = useMemo(() => [
    ch.accessor("company", {
      header: "Unternehmen",
      meta: { tooltip: (app) => app.company ?? undefined },
      cell: ({ row }) => {
        const app = row.original;
        const initial = app.company?.charAt(0).toUpperCase() ?? "?";
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 6, flexShrink: 0, overflow: "hidden",
              background: app.logoUrl ? "#fff" : getCompanyColor(app.company ?? ""),
              border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: "#fff",
            }}>
              {app.logoUrl
                ? <img src={app.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                : initial}
            </div>
            <span style={{ fontWeight: 500, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{app.company}</span>
          </div>
        );
      },
    }),
    ch.accessor("role", {
      header: "Stelle",
      meta: { tooltip: (app) => app.role ?? undefined },
      cell: ({ getValue }) => <span style={{ color: "var(--fg-1)", fontWeight: 400 }}>{getValue()}</span>,
    }),
    ch.accessor("stage", {
      header: "Phase",
      meta: { tooltip: (app) => STAGE_LABELS[app.stage ?? ""] ?? app.stage ?? undefined },
      cell: ({ getValue }) => {
        const s = getValue() ?? "";
        const color = STAGE_COLORS[s] ?? "#94a3b8";
        return (
          <span style={{
            padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
            background: `${color}18`, color, border: `1px solid ${color}40`,
          }}>
            {STAGE_LABELS[s] ?? s}
          </span>
        );
      },
    }),
    ch.accessor("location", {
      header: "Ort",
      meta: { tooltip: (app) => app.location ?? undefined },
      cell: ({ getValue }) => <span style={{ color: "var(--fg-2)" }}>{getValue() ?? "—"}</span>,
    }),
    ch.accessor("matchScore", {
      header: "Match",
      meta: { tooltip: (app) => app.matchScore != null ? `${app.matchScore}%` : undefined },
      cell: ({ getValue, row }) => {
        const v = getValue();
        const color = v != null ? (v >= 75 ? "#34d399" : v >= 50 ? "#fbbf24" : "#f87171") : "var(--fg-4)";
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ color, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v != null ? `${v}%` : "—"}</span>
            <RunAiButton appId={row.original.id} endpoint="/match-score" hasValue={v != null} />
          </span>
        );
      },
    }),
    ch.display({
      id: "salaryMedian",
      header: "Lohn-Median",
      meta: { tooltip: (app) => { const v = getSalaryMedian(app); return v ? `CHF ${v.toLocaleString("de-CH")}` : undefined; } },
      cell: ({ row }) => {
        const v = getSalaryMedian(row.original);
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: v ? "var(--fg-2)" : "var(--fg-4)", fontVariantNumeric: "tabular-nums" }}>{v ? `CHF ${v.toLocaleString("de-CH")}` : "—"}</span>
            <RunAiButton appId={row.original.id} endpoint="/ai/salary-check" hasValue={!!v} />
          </span>
        );
      },
    }),
    ch.display({
      id: "glassdoor",
      header: "Glassdoor",
      meta: { tooltip: (app) => { const r = getGlassdoorRating(app); return r ? `${r.toFixed(1)} / 5` : undefined; } },
      cell: ({ row }) => {
        const r = getGlassdoorRating(row.original);
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {r ? (
              <>
                <span style={{ color: "var(--fg-2)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{r.toFixed(1)}</span>
                <span style={{ color: "#4ade80", fontSize: 11 }}>{"★".repeat(Math.round(r))}{"☆".repeat(5 - Math.round(r))}</span>
              </>
            ) : <span style={{ color: "var(--fg-4)" }}>—</span>}
            <RunAiButton appId={row.original.id} endpoint="/ai/glassdoor-check" hasValue={!!r} />
          </span>
        );
      },
    }),
    ch.display({
      id: "kununu",
      header: "Kununu",
      meta: { tooltip: (app) => { const r = getKununuRating(app); return r ? `${r.toFixed(1)} / 5` : undefined; } },
      cell: ({ row }) => {
        const r = getKununuRating(row.original);
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {r ? (
              <>
                <span style={{ color: "var(--fg-2)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{r.toFixed(1)}</span>
                <span style={{ color: "#4ade80", fontSize: 11 }}>{"★".repeat(Math.round(r))}{"☆".repeat(5 - Math.round(r))}</span>
              </>
            ) : <span style={{ color: "var(--fg-4)" }}>—</span>}
            <RunAiButton appId={row.original.id} endpoint="/ai/kununu-check" hasValue={!!r} />
          </span>
        );
      },
    }),
    ch.accessor("salary", {
      header: "Lohn (Inserat)",
      meta: { tooltip: (app) => app.salary ?? undefined },
      cell: ({ getValue }) => <span style={{ color: "var(--fg-2)" }}>{getValue() ?? "—"}</span>,
    }),
    ch.accessor("source", {
      header: "Quelle",
      meta: { tooltip: (app) => SOURCE_LABELS[app.source ?? ""] ?? app.source ?? undefined },
      cell: ({ getValue }) => <span style={{ color: "var(--fg-3)", fontSize: 11 }}>{SOURCE_LABELS[getValue() ?? ""] ?? getValue() ?? "—"}</span>,
    }),
    ch.accessor("tags", {
      header: "Tags",
      meta: { tooltip: (app) => parseTags(app.tags).join(", ") || undefined },
      cell: ({ getValue }) => {
        const tags = parseTags(getValue());
        if (!tags.length) return <span style={{ color: "var(--fg-4)" }}>—</span>;
        return (
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {tags.slice(0, 3).map((t, i) => (
              <span key={i} style={{ padding: "1px 6px", borderRadius: 4, fontSize: 10, background: "var(--accent-08)", color: "var(--accent)", border: "1px solid var(--accent-15)" }}>{t}</span>
            ))}
            {tags.length > 3 && <span style={{ fontSize: 10, color: "var(--fg-4)" }}>+{tags.length - 3}</span>}
          </div>
        );
      },
    }),
    ch.accessor("appliedAt", {
      header: "Beworben",
      cell: ({ getValue }) => <span style={{ color: "var(--fg-3)", fontVariantNumeric: "tabular-nums" }}>{fmtDate(getValue())}</span>,
    }),
    ch.display({
      id: "interview1",
      header: "1. Interview",
      cell: ({ row }) => {
        const d = getInterview1Date(row.original);
        return <span style={{ color: "var(--fg-3)", fontVariantNumeric: "tabular-nums" }}>{d ? fmtDate(d) : "—"}</span>;
      },
    }),
    ch.accessor("createdAt", {
      header: "Erstellt",
      cell: ({ getValue }) => <span style={{ color: "var(--fg-4)", fontVariantNumeric: "tabular-nums" }}>{fmtDate(getValue())}</span>,
    }),
    ch.accessor("updatedAt", {
      header: "Aktualisiert",
      cell: ({ getValue }) => <span style={{ color: "var(--fg-4)", fontVariantNumeric: "tabular-nums" }}>{fmtDate(getValue())}</span>,
    }),
  ], []);

  // Resolve column config from store (with defaults)
  const columnOrder: ColumnOrderState      = tableColumnOrder.length > 0 ? tableColumnOrder : DEFAULT_ORDER;
  const columnVisibility: VisibilityState  = Object.keys(tableColumnVisibility).length > 0 ? tableColumnVisibility : DEFAULT_VISIBLE;
  const columnPinning: ColumnPinningState  = tableColumnPinning;
  const columnSizing: ColumnSizingState    = tableColumnSizing;

  const table = useReactTable({
    data: filtered,
    columns,
    defaultColumn: { size: 150, minSize: 60, maxSize: 600 },
    columnResizeMode: "onChange",
    state: { sorting, columnOrder, columnVisibility, columnPinning, columnSizing },
    onSortingChange: setSorting,
    onColumnOrderChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnOrder) : updater;
      setTableColumnOrder(next);
    },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnVisibility) : updater;
      setTableColumnVisibility(next as Record<string, boolean>);
    },
    onColumnPinningChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnPinning) : updater;
      setTableColumnPinning(next as { left: string[]; right: string[] });
    },
    onColumnSizingChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnSizing) : updater;
      setTableColumnSizing(next);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Drag-and-drop column reorder
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const src = result.source.index;
    const dst = result.destination.index;
    if (src === dst) return;
    const visibleIds = table.getVisibleLeafColumns().map(c => c.id);
    const allIds = [...columnOrder];
    const moving = visibleIds[src];
    const target = visibleIds[dst];
    const fromIdx = allIds.indexOf(moving);
    const toIdx   = allIds.indexOf(target);
    const next = [...allIds];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moving);
    setTableColumnOrder(next);
  };

  const resetColumns = () => {
    setTableColumnOrder(DEFAULT_ORDER);
    setTableColumnVisibility(DEFAULT_VISIBLE);
    setTableColumnPinning({ left: ["company"], right: [] });
    setTableColumnSizing({});
  };

  const pinColumn = (colId: string, side: "left" | "right" | false) => {
    const cur = tableColumnPinning;
    const left  = cur.left.filter(c => c !== colId);
    const right = cur.right.filter(c => c !== colId);
    if (side === "left")  left.push(colId);
    if (side === "right") right.push(colId);
    setTableColumnPinning({ left, right });
  };

  const allStages = Object.keys(STAGE_LABELS);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--bg)" }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "12px 20px",
        borderBottom: "1px solid var(--border)", flexShrink: 0, flexWrap: "wrap",
      }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--fg-1)", marginRight: 4 }}>
          Alle Bewerbungen
          <span style={{ fontSize: 11, fontWeight: 400, color: "var(--fg-4)", marginLeft: 6 }}>{filtered.length}</span>
        </div>

        {/* Search */}
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Search width={12} height={12} style={{ position: "absolute", left: 8, color: "var(--fg-4)", pointerEvents: "none" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Suchen…"
            style={{
              paddingLeft: 26, paddingRight: 8, height: 28, borderRadius: 6, fontSize: 12,
              background: "var(--surface)", border: "1px solid var(--border)", color: "var(--fg-1)",
              outline: "none", width: 160, fontFamily: "var(--font-sans)",
            }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ position: "absolute", right: 6, background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", padding: 0, display: "flex" }}>
              <Xmark width={10} height={10} />
            </button>
          )}
        </div>

        {/* Stage Filter */}
        <div style={{ position: "relative" }} ref={stageRef}>
          <button
            onClick={() => setStageOpen(v => !v)}
            className="btn btn-secondary"
            style={{ fontSize: 11, gap: 5, background: stageFilter.length > 0 ? "var(--accent-08)" : undefined, color: stageFilter.length > 0 ? "var(--accent)" : undefined }}
          >
            Phase {stageFilter.length > 0 && `(${stageFilter.length})`}
            <NavArrowDown width={10} height={10} />
          </button>
          {stageOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8,
              padding: 6, minWidth: 160, boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            }}>
              {allStages.map(s => {
                const color = STAGE_COLORS[s] ?? "#94a3b8";
                const checked = stageFilter.includes(s);
                return (
                  <label key={s} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 5, cursor: "pointer", fontSize: 12, color: checked ? "var(--fg-1)" : "var(--fg-2)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}>
                    <input type="checkbox" checked={checked} onChange={() => setStageFilter(prev => checked ? prev.filter(x => x !== s) : [...prev, s])}
                      style={{ accentColor: color, width: 13, height: 13 }} />
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: color, flexShrink: 0 }} />
                    {STAGE_LABELS[s]}
                  </label>
                );
              })}
              {stageFilter.length > 0 && (
                <button onClick={() => setStageFilter([])} style={{ width: "100%", marginTop: 4, padding: "4px 8px", borderRadius: 5, border: "none", background: "none", cursor: "pointer", fontSize: 11, color: "var(--fg-4)", textAlign: "left", fontFamily: "var(--font-sans)" }}>
                  Alle entfernen
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Column settings */}
        <div style={{ position: "relative" }} ref={colPanelRef}>
          <button onClick={() => setColPanelOpen(v => !v)} className="btn btn-secondary" style={{ fontSize: 11, gap: 5 }}>
            <Settings width={12} height={12} /> Spalten
          </button>
          {colPanelOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50,
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8,
              padding: 8, minWidth: 260, maxHeight: 420, overflowY: "auto",
              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, padding: "0 4px" }}>Spalten</div>
              {table.getAllLeafColumns().map(col => {
                const pinned = col.getIsPinned();
                const label = typeof col.columnDef.header === "string" ? col.columnDef.header : col.id;
                return (
                  <div key={col.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 4px", borderRadius: 5 }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}>
                    <input type="checkbox" checked={col.getIsVisible()} onChange={col.getToggleVisibilityHandler()}
                      style={{ accentColor: "var(--accent)", width: 13, height: 13, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: "var(--fg-2)", cursor: "default" }}>{label}</span>
                    {/* Pin buttons */}
                    <button onClick={() => pinColumn(col.id, pinned === "left" ? false : "left")} title={pinned === "left" ? "Links lösen" : "Links fixieren"}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 3px", borderRadius: 3, display: "flex", alignItems: "center", color: pinned === "left" ? "var(--accent)" : "var(--fg-4)" }}>
                      {pinned === "left" ? <PinSlash width={11} height={11} /> : <Pin width={11} height={11} />}
                    </button>
                    <span style={{ fontSize: 9, color: "var(--fg-4)" }}>L</span>
                    <button onClick={() => pinColumn(col.id, pinned === "right" ? false : "right")} title={pinned === "right" ? "Rechts lösen" : "Rechts fixieren"}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 3px", borderRadius: 3, display: "flex", alignItems: "center", color: pinned === "right" ? "var(--accent)" : "var(--fg-4)" }}>
                      {pinned === "right" ? <PinSlash width={11} height={11} /> : <Pin width={11} height={11} />}
                    </button>
                    <span style={{ fontSize: 9, color: "var(--fg-4)" }}>R</span>
                  </div>
                );
              })}
              <button onClick={resetColumns} style={{ width: "100%", marginTop: 8, padding: "5px 8px", borderRadius: 5, border: "1px solid var(--border)", background: "none", cursor: "pointer", fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-sans)" }}>
                Zurücksetzen
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table — horizontal scroll */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed", width: table.getTotalSize() }}>
          <thead>
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="columns" direction="horizontal">
                {(provided) => (
                  <tr ref={provided.innerRef} {...provided.droppableProps}
                    style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--surface)" }}>
                    {table.getVisibleLeafColumns().map((col, index) => {
                      const isSorted  = col.getIsSorted();
                      const isPinned  = col.getIsPinned();
                      const isHovered = hoveredColId === col.id;
                      const stickyStyle: React.CSSProperties = isPinned === "left"
                        ? { position: "sticky", left: col.getStart("left"), zIndex: 21, boxShadow: "2px 0 4px rgba(0,0,0,0.15)" }
                        : isPinned === "right"
                        ? { position: "sticky", right: col.getAfter("right"), zIndex: 21, boxShadow: "-2px 0 4px rgba(0,0,0,0.15)" }
                        : {};
                      return (
                        <Draggable key={col.id} draggableId={col.id} index={index}>
                          {(drag, snap) => {
                            // Get the actual header object for resize handler
                            const header = table.getHeaderGroups()[0]?.headers.find(h => h.column.id === col.id);
                            return (<th
                              ref={drag.innerRef}
                              {...drag.draggableProps}
                              onMouseEnter={() => setHoveredColId(col.id)}
                              onMouseLeave={() => setHoveredColId(null)}
                              style={{
                                ...(drag.draggableProps.style ?? {}),
                                ...stickyStyle,
                                width: col.getSize(), minWidth: col.getSize(),
                                padding: "8px 12px", textAlign: "left", fontWeight: 600,
                                fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase",
                                letterSpacing: "0.06em", userSelect: "none", whiteSpace: "nowrap",
                                borderBottom: "1px solid var(--border)",
                                background: snap.isDragging ? "var(--surface-2)" : "var(--surface)",
                                position: (drag.draggableProps.style as React.CSSProperties | undefined)?.position ?? stickyStyle.position ?? "relative",
                                overflow: "hidden",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span
                                  onClick={col.getCanSort() ? col.getToggleSortingHandler() : undefined}
                                  style={{ cursor: col.getCanSort() ? "pointer" : "default", display: "flex", alignItems: "center", gap: 3, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}
                                >
                                  {typeof col.columnDef.header === "string" ? col.columnDef.header : col.id}
                                  {isSorted === "asc"  && <NavArrowUp   width={10} height={10} style={{ color: "var(--accent)", flexShrink: 0 }} />}
                                  {isSorted === "desc" && <NavArrowDown  width={10} height={10} style={{ color: "var(--accent)", flexShrink: 0 }} />}
                                </span>
                                {/* Drag handle — only on hover, right of name */}
                                <span {...drag.dragHandleProps}
                                  style={{ opacity: isHovered ? 0.5 : 0, display: "flex", cursor: "grab", transition: "opacity 0.15s", flexShrink: 0 }}>
                                  <Drag width={10} height={10} />
                                </span>
                              </div>
                              {/* Resize handle */}
                              <div
                                onMouseDown={header?.getResizeHandler()}
                                style={{
                                  position: "absolute", right: 0, top: 0, height: "100%", width: 4,
                                  cursor: "col-resize", userSelect: "none", touchAction: "none",
                                  background: col.getIsResizing() ? "var(--accent)" : isHovered ? "var(--border)" : "transparent",
                                  transition: "background 0.15s",
                                }}
                              />
                            </th>
                            );
                          }}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </tr>
                )}
              </Droppable>
            </DragDropContext>
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, ri) => (
              <tr
                key={row.id}
                onClick={() => setSelectedApp(row.original)}
                style={{
                  cursor: "pointer",
                  background: ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                  borderBottom: "1px solid var(--border)",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--surface)")}
                onMouseLeave={e => (e.currentTarget.style.background = ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)")}
              >
                {row.getVisibleCells().map(cell => {
                  const tooltip  = cell.column.columnDef.meta?.tooltip?.(row.original);
                  const isPinned = cell.column.getIsPinned();
                  const stickyCell: React.CSSProperties = isPinned === "left"
                    ? { position: "sticky", left: cell.column.getStart("left"), background: "inherit", zIndex: 2, boxShadow: "2px 0 4px rgba(0,0,0,0.1)" }
                    : isPinned === "right"
                    ? { position: "sticky", right: cell.column.getAfter("right"), background: "inherit", zIndex: 2, boxShadow: "-2px 0 4px rgba(0,0,0,0.1)" }
                    : {};
                  return (
                    <td key={cell.id} title={tooltip}
                      style={{ padding: "9px 12px", overflow: "hidden", width: cell.column.getSize(), maxWidth: cell.column.getSize(), ...stickyCell }}>
                      <div style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length} style={{ padding: "48px 20px", textAlign: "center", color: "var(--fg-4)", fontSize: 13 }}>
                  Keine Bewerbungen gefunden
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Drawer */}
      {selectedApp && (
        <DetailDrawer
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
          onArchived={() => setSelectedApp(null)}
        />
      )}
    </div>
  );
}

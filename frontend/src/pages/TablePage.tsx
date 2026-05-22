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
import type { Application } from "@application-pal/shared";
import { api } from "../lib/api";
import { useUiStore } from "../lib/store";
import {
  NavArrowUp, NavArrowDown, Settings, Plus, Check,
  Drag, Sparks, Refresh, RefreshCircle, Pin, PinSlash,
} from "iconoir-react";
import { Topbar } from "../components/Topbar";
import { DetailDrawer } from "../components/DetailDrawer";
import { ImportDrawer } from "../components/ImportDrawer";

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

const ALL_STAGES = Object.keys(STAGE_LABELS);

// Pensum values are stored as-is ("100%", "80-100%", etc.) — no mapping needed

const WORK_MODEL_LABELS: Record<string, string> = {
  onsite: "Vor Ort",
  hybrid: "Hybrid",
  remote: "Remote",
};

const DEFAULT_VISIBLE: VisibilityState = {
  company: true, role: true, stage: true, location: true,
  matchScore: true, salaryMedian: true, glassdoor: true, kununu: true,
  salary: false, source: false, tags: false, appliedAt: true,
  interview1: false, createdAt: true, updatedAt: false,
  jobType: true, workModel: true, contractType: false,
};

const DEFAULT_ORDER = [
  "company","role","stage","location","jobType","workModel","contractType",
  "matchScore","salaryMedian","glassdoor","kununu","salary","source","tags",
  "appliedAt","interview1","createdAt","updatedAt",
];

const DEFAULT_PINNING: ColumnPinningState = { left: ["company"], right: [] };

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
  endpoint: string;
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
  const [filterOpen, setFilterOpen] = useState(false);
  const [colPanelOpen, setColPanelOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [hoveredColId, setHoveredColId] = useState<string | null>(null);
  const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);
  // Native HTML5 drag-and-drop for column reorder (no DnD library = no sticky conflict)
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const colPanelRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const { data: apps = [] } = useQuery<Application[]>({
    queryKey: ["applications"],
    queryFn: () => api.get("/api/applications").then(r => r.data),
  });

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colPanelRef.current && !colPanelRef.current.contains(e.target as Node)) setColPanelOpen(false);
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
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
        // Use CSS variables for WCAG-accessible colours in both light/dark modes
        const colorVar = `var(--stage-color-${s}, #94a3b8)`;
        return (
          <span style={{
            padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
            color: colorVar,
            background: `color-mix(in srgb, ${colorVar} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${colorVar} 27%, transparent)`,
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
        const level = v != null ? (v >= 75 ? "high" : v >= 50 ? "mid" : "low") : null;
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{
              fontWeight: 700, fontVariantNumeric: "tabular-nums",
              color: level ? `var(--score-${level})` : "var(--fg-4)",
            }}>
              {v != null ? `${v}%` : "—"}
            </span>
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
    ch.accessor("jobType", {
      header: "Pensum",
      meta: { tooltip: (app) => (app as Application & { jobType?: string }).jobType ?? undefined },
      cell: ({ row }) => {
        const v = (row.original as Application & { jobType?: string }).jobType;
        return v
          ? <span style={{ padding: "1px 7px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: "var(--accent-08)", color: "var(--accent)", border: "1px solid var(--accent-15)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{v}</span>
          : <span style={{ color: "var(--fg-4)" }}>—</span>;
      },
    }),
    ch.accessor("workModel", {
      header: "Arbeitsmodell",
      meta: { tooltip: (app) => WORK_MODEL_LABELS[(app as Application & { workModel?: string }).workModel ?? ""] ?? undefined },
      cell: ({ row }) => {
        const v = (row.original as Application & { workModel?: string }).workModel;
        const label = v ? (WORK_MODEL_LABELS[v] ?? v) : null;
        const colorMap: Record<string, string> = { onsite: "#60a5fa", hybrid: "#a78bfa", remote: "#34d399" };
        const color = v ? (colorMap[v] ?? "var(--fg-3)") : "var(--fg-4)";
        return label
          ? <span style={{ padding: "1px 7px", borderRadius: 999, fontSize: 10, fontWeight: 600, background: `color-mix(in srgb, ${color} 12%, transparent)`, color, border: `1px solid color-mix(in srgb, ${color} 27%, transparent)`, whiteSpace: "nowrap" }}>{label}</span>
          : <span style={{ color: "var(--fg-4)" }}>—</span>;
      },
    }),
    ch.accessor("contractType", {
      header: "Vertrag",
      meta: { tooltip: (app) => (app as Application & { contractType?: string }).contractType ?? undefined },
      cell: ({ row }) => {
        const v = (row.original as Application & { contractType?: string }).contractType;
        if (!v) return <span style={{ color: "var(--fg-4)" }}>—</span>;
        const isUnlimited = v.toLowerCase() === "unlimited" || v.toLowerCase() === "unbefristet";
        return <span style={{ color: isUnlimited ? "var(--fg-2)" : "var(--fg-3)", fontSize: 11 }}>{isUnlimited ? "Unbefristet" : v}</span>;
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
      cell: ({ getValue }) => {
        const d = getValue();
        if (!d) return <span style={{ color: "var(--fg-4)" }}>—</span>;
        const date = new Date(d);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ color: "var(--fg-4)", fontVariantNumeric: "tabular-nums" }}>
              {date.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit" })}
            </span>
            <span style={{ color: "var(--fg-4)", fontVariantNumeric: "tabular-nums", fontSize: 10, opacity: 0.7 }}>
              {date.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        );
      },
    }),
    ch.accessor("updatedAt", {
      header: "Aktualisiert",
      cell: ({ getValue }) => <span style={{ color: "var(--fg-4)", fontVariantNumeric: "tabular-nums" }}>{fmtDate(getValue())}</span>,
    }),
  ], []);

  // Resolve column config from store (with defaults)
  const columnOrder: ColumnOrderState      = tableColumnOrder.length > 0 ? tableColumnOrder : DEFAULT_ORDER;
  const columnVisibility: VisibilityState  = Object.keys(tableColumnVisibility).length > 0 ? tableColumnVisibility : DEFAULT_VISIBLE;
  const columnPinning: ColumnPinningState  = (tableColumnPinning.left.length > 0 || tableColumnPinning.right.length > 0) ? tableColumnPinning : DEFAULT_PINNING;
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
      const raw = typeof updater === "function" ? updater(columnPinning) : updater;
      setTableColumnPinning({ left: (raw.left ?? []) as string[], right: (raw.right ?? []) as string[] });
    },
    onColumnSizingChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnSizing) : updater;
      setTableColumnSizing(next);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Native HTML5 column reorder handlers
  const handleColDragStart = (colId: string) => setDragColId(colId);
  const handleColDragOver  = (e: React.DragEvent, colId: string) => { e.preventDefault(); setDragOverColId(colId); };
  const handleColDrop      = (e: React.DragEvent, targetColId: string) => {
    e.preventDefault();
    if (!dragColId || dragColId === targetColId) { setDragColId(null); setDragOverColId(null); return; }
    const allIds = [...columnOrder];
    const fromIdx = allIds.indexOf(dragColId);
    const toIdx   = allIds.indexOf(targetColId);
    if (fromIdx < 0 || toIdx < 0) { setDragColId(null); setDragOverColId(null); return; }
    const next = [...allIds];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, dragColId);
    setTableColumnOrder(next);
    setDragColId(null);
    setDragOverColId(null);
  };
  const handleColDragEnd   = () => { setDragColId(null); setDragOverColId(null); };

  const resetColumns = () => {
    setTableColumnOrder(DEFAULT_ORDER);
    setTableColumnVisibility(DEFAULT_VISIBLE);
    setTableColumnPinning({ left: [...DEFAULT_PINNING.left!], right: [...DEFAULT_PINNING.right!] });
    setTableColumnSizing({});
  };

  // Only left-pinning is supported; right-pinning is disabled
  const pinColumn = (colId: string, side: "left" | false) => {
    const left = tableColumnPinning.left.filter(c => c !== colId);
    if (side === "left") left.push(colId);
    setTableColumnPinning({ left, right: [] });
  };

  // ── Topbar actions ───────────────────────────────────────────────────────────

  const isFiltered = stageFilter.length > 0;

  const actions = (
    <>
      {/* Column settings — left of filter */}
      <div style={{ position: "relative" }} ref={colPanelRef}>
        <button onClick={() => setColPanelOpen(v => !v)} className="btn btn-secondary" style={{ fontSize: 11, gap: 5 }}>
          <Settings width={12} height={12} /> Spalten
        </button>
        {colPanelOpen && (
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
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
                  <button onClick={() => pinColumn(col.id, pinned === "left" ? false : "left")} title={pinned === "left" ? "Links lösen" : "Links fixieren"}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 3px", borderRadius: 3, display: "flex", alignItems: "center", color: pinned === "left" ? "var(--accent)" : "var(--fg-4)" }}>
                    {pinned === "left" ? <PinSlash width={11} height={11} /> : <Pin width={11} height={11} />}
                  </button>
                </div>
              );
            })}
            <button onClick={resetColumns} style={{ width: "100%", marginTop: 8, padding: "5px 8px", borderRadius: 5, border: "1px solid var(--border)", background: "none", cursor: "pointer", fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-sans)" }}>
              Zurücksetzen
            </button>
          </div>
        )}
      </div>

      {/* Stage filter */}
      <div style={{ position: "relative" }} ref={filterRef}>
        <button
          onClick={() => setFilterOpen(v => !v)}
          className="btn btn-secondary"
          style={{
            fontSize: 11, gap: 5,
            background: isFiltered ? "var(--accent-08)" : undefined,
            color: isFiltered ? "var(--accent)" : undefined,
          }}
        >
          <Settings width={12} height={12} />
          Filter {isFiltered && `(${stageFilter.length})`}
          <NavArrowDown width={10} height={10} />
        </button>
        {filterOpen && (
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
            background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12,
            padding: 8, minWidth: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px 8px", borderBottom: "1px solid var(--border)", marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Phasen</span>
              {stageFilter.length > 0 && (
                <button onClick={() => setStageFilter([])} style={{ fontSize: 10, fontWeight: 600, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", padding: "2px 4px" }}>Alle</button>
              )}
            </div>
            {ALL_STAGES.map(s => {
              const colorVar = `var(--stage-color-${s}, #94a3b8)`;
              const checked = stageFilter.includes(s);
              return (
                <button key={s} onClick={() => setStageFilter(prev => checked ? prev.filter(x => x !== s) : [...prev, s])} style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  padding: "7px 10px", borderRadius: 8, border: "none",
                  background: checked ? `color-mix(in srgb, ${colorVar} 12%, transparent)` : "transparent",
                  cursor: "pointer", fontFamily: "var(--font-sans)", transition: "background 0.1s",
                }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: checked ? colorVar : "var(--border)", transition: "background 0.1s" }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: checked ? 600 : 400, color: checked ? "var(--fg-1)" : "var(--fg-3)", textAlign: "left" }}>{STAGE_LABELS[s]}</span>
                  {checked && <Check width={12} height={12} style={{ color: colorVar, flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Import */}
      <button className="btn btn-primary" onClick={() => setImportOpen(true)}>
        <Plus width={13} height={13} /> Import Job
      </button>
    </>
  );

  // ── Table ─────────────────────────────────────────────────────────────────────

  return (
    <>
      <Topbar
        title="Liste"
        sub={`${filtered.length} Bewerbungen`}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Suchen nach Firma, Stelle, Ort…"
        actions={actions}
      />

      {/*
        SINGLE-TABLE layout — the only approach that guarantees header/body column alignment.

        Rule: NEVER put two sticky axes on the same element.
          thead  → position:sticky top:0     (vertical only — stays visible when scrolling down)
          th/td  → position:sticky left/right (horizontal only — stays visible when scrolling sideways)

        thead sticky + child th/td horizontal-sticky both resolve to the SAME scroll container
        (div.overflow-auto). They don't interfere with each other.
        No DnD library wrappers. No two-table approach.
      */}
      <div style={{ flex: 1, overflow: "auto", background: "var(--bg)" }}>
        <table style={{
          borderCollapse: "separate", borderSpacing: 0,
          fontSize: 12, tableLayout: "fixed", width: table.getTotalSize(),
        }}>
          {/* colgroup forces identical column widths for header and body rows */}
          <colgroup>
            {table.getVisibleLeafColumns().map(col => (
              <col key={col.id} style={{ width: col.getSize(), minWidth: col.getSize() }} />
            ))}
          </colgroup>

          {/* thead sticky top:0 — vertical anchor only */}
          <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
            <tr>
              {table.getVisibleLeafColumns().map(col => {
                const isSorted     = col.getIsSorted();
                const isPinned     = col.getIsPinned();
                const isHovered    = hoveredColId === col.id;
                const isDragging   = dragColId === col.id;
                const isDragTarget = dragOverColId === col.id && dragColId !== col.id;
                const header       = table.getHeaderGroups()[0]?.headers.find(h => h.column.id === col.id);

                // th: horizontal sticky ONLY (no top — thead handles vertical); no shadow on header
                const thStyle: React.CSSProperties = isPinned === "left"
                  ? { position: "sticky", left: col.getStart("left"),  zIndex: 2, background: "var(--surface)" }
                  : { background: "var(--surface)" };

                return (
                  <th
                    key={col.id}
                    onMouseEnter={() => setHoveredColId(col.id)}
                    onMouseLeave={() => setHoveredColId(null)}
                    onDragOver={e => handleColDragOver(e, col.id)}
                    onDrop={e => handleColDrop(e, col.id)}
                    style={{
                      ...thStyle,
                      padding: "8px 12px", textAlign: "left", fontWeight: 600,
                      fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase",
                      letterSpacing: "0.06em", userSelect: "none", whiteSpace: "nowrap",
                      borderBottom: "1px solid var(--border)",
                      overflow: "hidden",
                      opacity: isDragging ? 0.4 : 1,
                      outline: isDragTarget ? "2px solid var(--accent)" : undefined,
                      outlineOffset: isDragTarget ? "-2px" : undefined,
                      transition: "opacity 0.15s",
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
                      <span
                        draggable
                        onDragStart={() => handleColDragStart(col.id)}
                        onDragEnd={handleColDragEnd}
                        style={{ opacity: isHovered ? 0.5 : 0, display: "flex", cursor: "grab", transition: "opacity 0.15s", flexShrink: 0 }}
                      >
                        <Drag width={10} height={10} />
                      </span>
                    </div>
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
              })}
            </tr>
          </thead>

          <tbody>
            {table.getRowModel().rows.map((row, ri) => {
              const rowBg = hoveredRowIndex === ri
                ? "var(--surface)"
                : ri % 2 === 0 ? "var(--bg)" : "color-mix(in srgb, var(--bg) 97%, white 3%)";
              return (
                <tr
                  key={row.id}
                  onClick={() => setSelectedApp(row.original)}
                  style={{ cursor: "pointer", background: rowBg, borderBottom: "1px solid var(--border)", transition: "background 0.1s" }}
                  onMouseEnter={() => setHoveredRowIndex(ri)}
                  onMouseLeave={() => setHoveredRowIndex(null)}
                >
                  {row.getVisibleCells().map(cell => {
                    const tooltip  = cell.column.columnDef.meta?.tooltip?.(row.original);
                    const isPinned = cell.column.getIsPinned();
                    // td: horizontal sticky ONLY
                    const tdStyle: React.CSSProperties = isPinned === "left"
                      ? { position: "sticky", left: cell.column.getStart("left"),  background: rowBg, zIndex: 2, boxShadow: "2px 0 5px rgba(0,0,0,0.10)" }
                      : isPinned === "right"
                      ? { position: "sticky", right: cell.column.getAfter("right"), background: rowBg, zIndex: 2, boxShadow: "-2px 0 5px rgba(0,0,0,0.10)" }
                      : {};
                    return (
                      <td key={cell.id} title={tooltip}
                        style={{ padding: "9px 12px", overflow: "hidden", ...tdStyle }}>
                        <div style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
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

      {/* Import */}
      {importOpen && <ImportDrawer onClose={() => setImportOpen(false)} />}
    </>
  );
}

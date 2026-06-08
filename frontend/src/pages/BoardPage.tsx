import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Settings, Plus, Check, ViewGrid, List, NavArrowUp, NavArrowDown } from "iconoir-react";
import type { Application } from "@application-pal/shared";
import { api } from "../lib/api";
import { useUiStore } from "../lib/store";
import { useTranslation } from "react-i18next";
import { Topbar } from "../components/Topbar";
import { matchesSearch } from "../lib/search";
import { Board } from "../components/Board";
import { ImportDrawer } from "../components/ImportDrawer";
import { DetailDrawer } from "../components/DetailDrawer";
import { ARCHIVE_REASON_LABELS } from "../components/DetailDrawer";

const ALL_STAGES = [
  { id: "import_validating", label: "Inbox",            color: "#94a3b8" },
  { id: "preparing_cv",      label: "Preparing CV",     color: "#60a5fa" },
  { id: "preparing_letter",  label: "Preparing Letter", color: "#22d3ee" },
  { id: "application_sent",  label: "Submitted",        color: "#a78bfa" },
  { id: "pending",           label: "Pending",          color: "#fbbf24" },
  { id: "interview_1",       label: "1st Interview",    color: "#34d399" },
  { id: "interview_2",       label: "2nd Interview",    color: "#10b981" },
  { id: "rejected",          label: "Rejected",         color: "#f87171" },
  { id: "accepted",          label: "Accepted",         color: "#84cc16" },
];

// ─── Time horizon filter options ──────────────────────────────
const TIME_OPTION_IDS = ["all", "1w", "2w", "1m", "3m", "older5w", "older3m"] as const;
type TimeFilter = typeof TIME_OPTION_IDS[number];

function matchesTimeFilter(app: Application, timeFilter: TimeFilter): boolean {
  if (timeFilter === "all") return true;
  const date = new Date(app.updatedAt ?? app.createdAt);
  const now = Date.now();
  const age = now - date.getTime();
  const W = 7 * 24 * 60 * 60 * 1000;
  const M = 30 * 24 * 60 * 60 * 1000;
  if (timeFilter === "1w")     return age <= W;
  if (timeFilter === "2w")     return age <= 2 * W;
  if (timeFilter === "1m")     return age <= M;
  if (timeFilter === "3m")     return age <= 3 * M;
  if (timeFilter === "older5w") return age > 5 * W;
  if (timeFilter === "older3m") return age > 3 * M;
  return true;
}

// ─── Archive reason filter options ────────────────────────────
const ARCHIVE_REASON_OPTION_IDS = ["all", "unavailable", "irrelevant", "taken", "other", "none"] as const;
type ReasonFilter = typeof ARCHIVE_REASON_OPTION_IDS[number];

// ─── Filter Dropdown (main board: stages + time) ──────────────
function FilterDropdown({
  visible, onChangeStages,
  timeFilter, onChangeTime,
  onClose
}: {
  visible: string[];
  onChangeStages: (stages: string[]) => void;
  timeFilter: TimeFilter;
  onChangeTime: (t: TimeFilter) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const allSelected = visible.length === 0 || visible.length === ALL_STAGES.length;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const toggle = (id: string) => {
    if (allSelected) { onChangeStages([id]); return; }
    const next = visible.includes(id) ? visible.filter(s => s !== id) : [...visible, id];
    onChangeStages(next.length === 0 ? [] : next);
  };

  const isVisible = (id: string) => allSelected || visible.includes(id);

  const timeOptions = TIME_OPTION_IDS.map(id => ({ id, label: t(`board.time.${id}`) }));

  return (
    <div ref={ref} style={{
      position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 50,
      background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12,
      padding: 8, minWidth: 240, boxShadow: "0 8px 24px rgba(0,0,0,0.18)"
    }}>
      {/* Stages */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px 8px", borderBottom: "1px solid var(--border)", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("board.filterSection.phases")}</span>
        <button onClick={() => onChangeStages([])} style={{ fontSize: 10, fontWeight: 600, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", padding: "2px 4px" }}>{t("board.filterSection.all")}</button>
      </div>
      {ALL_STAGES.map((s) => {
        const active = isVisible(s.id);
        return (
          <button key={s.id} onClick={() => toggle(s.id)} style={{
            display: "flex", alignItems: "center", gap: 10, width: "100%",
            padding: "7px 10px", borderRadius: 8, border: "none",
            background: active ? `${s.color}14` : "transparent",
            cursor: "pointer", fontFamily: "var(--font-sans)", transition: "background 0.1s"
          }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: active ? s.color : "var(--border)", transition: "background 0.1s" }} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "var(--fg-1)" : "var(--fg-3)", textAlign: "left" }}>{s.label}</span>
            {active && !allSelected && <Check width={12} height={12} style={{ color: s.color, flexShrink: 0 }} />}
          </button>
        );
      })}

      {/* Time horizon */}
      <div style={{ padding: "8px 8px 4px", borderTop: "1px solid var(--border)", marginTop: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("board.filterSection.period")}</span>
      </div>
      {timeOptions.map((opt) => (
        <button key={opt.id} onClick={() => onChangeTime(opt.id)} style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "7px 10px", borderRadius: 8, border: "none",
          background: timeFilter === opt.id ? "var(--accent-08)" : "transparent",
          cursor: "pointer", fontFamily: "var(--font-sans)", transition: "background 0.1s"
        }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: timeFilter === opt.id ? 600 : 400, color: timeFilter === opt.id ? "var(--accent)" : "var(--fg-2)", textAlign: "left" }}>{opt.label}</span>
          {timeFilter === opt.id && <Check width={12} height={12} style={{ color: "var(--accent)" }} />}
        </button>
      ))}
    </div>
  );
}

// ─── Archive Filter Dropdown (reason + time) ──────────────────
function ArchiveFilterDropdown({
  reasonFilter, onChangeReason,
  timeFilter, onChangeTime,
  onClose
}: {
  reasonFilter: ReasonFilter;
  onChangeReason: (r: ReasonFilter) => void;
  timeFilter: TimeFilter;
  onChangeTime: (t: TimeFilter) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const reasonOptions = ARCHIVE_REASON_OPTION_IDS.map(id => {
    let label: string;
    if (id === "all")  label = t("board.reasonFilter.all");
    else if (id === "none") label = t("board.reasonFilter.none");
    else label = ARCHIVE_REASON_LABELS[id] ?? id;
    return { id, label };
  });

  const timeOptions = TIME_OPTION_IDS.map(id => ({ id, label: t(`board.time.${id}`) }));

  return (
    <div ref={ref} style={{
      position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 50,
      background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12,
      padding: 8, minWidth: 240, boxShadow: "0 8px 24px rgba(0,0,0,0.18)"
    }}>
      {/* Archive reason */}
      <div style={{ padding: "4px 8px 8px", borderBottom: "1px solid var(--border)", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("board.filterSection.archiveReason")}</span>
      </div>
      {reasonOptions.map((r) => (
        <button key={r.id} onClick={() => onChangeReason(r.id)} style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "7px 10px", borderRadius: 8, border: "none",
          background: reasonFilter === r.id ? "var(--accent-08)" : "transparent",
          cursor: "pointer", fontFamily: "var(--font-sans)", transition: "background 0.1s"
        }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: reasonFilter === r.id ? 600 : 400, color: reasonFilter === r.id ? "var(--accent)" : "var(--fg-2)", textAlign: "left" }}>{r.label}</span>
          {reasonFilter === r.id && <Check width={12} height={12} style={{ color: "var(--accent)" }} />}
        </button>
      ))}

      {/* Time horizon */}
      <div style={{ padding: "8px 8px 4px", borderTop: "1px solid var(--border)", marginTop: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("board.filterSection.period")}</span>
      </div>
      {timeOptions.map((opt) => (
        <button key={opt.id} onClick={() => onChangeTime(opt.id)} style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "7px 10px", borderRadius: 8, border: "none",
          background: timeFilter === opt.id ? "var(--accent-08)" : "transparent",
          cursor: "pointer", fontFamily: "var(--font-sans)", transition: "background 0.1s"
        }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: timeFilter === opt.id ? 600 : 400, color: timeFilter === opt.id ? "var(--accent)" : "var(--fg-2)", textAlign: "left" }}>{opt.label}</span>
          {timeFilter === opt.id && <Check width={12} height={12} style={{ color: "var(--accent)" }} />}
        </button>
      ))}
    </div>
  );
}

// ─── Archive columns (by rejection reason) ────────────────────
const ARCHIVE_COLS = [
  { id: "unavailable", color: "#f87171" },
  { id: "irrelevant",  color: "#fbbf24" },
  { id: "taken",       color: "#94a3b8" },
  { id: "other",       color: "#8896a8" },
  { id: "_none",       color: "#535e6b" },
] as const;

function ArchiveCard({ app, onClick, isSelected }: { app: Application; onClick: () => void; isSelected?: boolean }) {
  const score = app.matchScore;
  return (
    <div
      onClick={onClick}
      style={{
        padding: "10px 12px", borderRadius: 8, cursor: "pointer", marginBottom: 6, transition: "border-color 0.12s, background 0.12s",
        border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
        background: isSelected ? "var(--accent-08)" : "var(--surface)",
        boxShadow: isSelected ? "0 0 0 1px var(--accent)" : undefined,
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = "rgba(59,130,246,0.35)"; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = "var(--border)"; }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-1)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{app.role}</div>
      <div style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 6 }}>{app.company}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9, color: "var(--fg-4)", fontFamily: "var(--font-mono)" }}>
          {new Date(app.createdAt).toLocaleDateString("de-CH")}
        </span>
        {score != null && (
          <span style={{
            padding: "1px 6px", borderRadius: 999, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)",
            background: score >= 75 ? "rgba(52,211,153,0.15)" : score >= 50 ? "rgba(251,191,36,0.15)" : "rgba(248,113,113,0.15)",
            color: score >= 75 ? "#34d399" : score >= 50 ? "#fbbf24" : "#f87171",
          }}>{score}%</span>
        )}
      </div>
    </div>
  );
}

function ArchiveKanban({ applications, onCardClick, selectedId }: { applications: Application[]; onCardClick: (id: string) => void; selectedId?: string | null }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", gap: 12, padding: "16px 20px", overflowX: "auto", alignItems: "flex-start", flex: 1 }}>
      {ARCHIVE_COLS.map(col => {
        const apps = applications.filter(a =>
          col.id === "_none" ? !a.archiveReason : a.archiveReason === col.id
        );
        const label = col.id === "_none" ? t("board.noReasonLabel") : (ARCHIVE_REASON_LABELS[col.id] ?? col.id);
        return (
          <div key={col.id} style={{ width: 248, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "0 2px" }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: col.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-2)", flex: 1 }}>{label}</span>
              <span style={{ fontSize: 10, color: "var(--fg-4)", fontFamily: "var(--font-mono)" }}>{apps.length}</span>
            </div>
            {apps.map(app => <ArchiveCard key={app.id} app={app} onClick={() => onCardClick(app.id)} isSelected={selectedId === app.id} />)}
            {apps.length === 0 && (
              <div style={{ border: "1px dashed var(--border)", borderRadius: 8, padding: "20px 12px", textAlign: "center", fontSize: 11, color: "var(--fg-4)" }}>
                {t("board.noEntries")}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type ArchiveSortKey = "role" | "createdAt" | "company" | "reason" | "score";

function ArchiveTable({ applications, onRowClick, selectedId }: { applications: Application[]; onRowClick: (id: string) => void; selectedId?: string | null }) {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<ArchiveSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (key: ArchiveSortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = [...applications].sort((a, b) => {
    let va: string | number, vb: string | number;
    switch (sortKey) {
      case "role":      va = a.role ?? ""; vb = b.role ?? ""; break;
      case "company":   va = a.company ?? ""; vb = b.company ?? ""; break;
      case "reason":    va = a.archiveReason ?? ""; vb = b.archiveReason ?? ""; break;
      case "score":     va = a.matchScore ?? -1; vb = b.matchScore ?? -1; break;
      case "createdAt": va = new Date(a.createdAt).getTime(); vb = new Date(b.createdAt).getTime(); break;
      default: va = ""; vb = "";
    }
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const SortIcon = ({ k }: { k: ArchiveSortKey }) => sortKey !== k ? null : (
    sortDir === "asc"
      ? <NavArrowUp  width={9} height={9} style={{ flexShrink: 0, color: "var(--accent)" }} />
      : <NavArrowDown width={9} height={9} style={{ flexShrink: 0, color: "var(--accent)" }} />
  );

  const cols: { key: ArchiveSortKey; label: string; flex: number }[] = [
    { key: "role",      label: t("board.col.name"),            flex: 3 },
    { key: "createdAt", label: t("board.col.created"),         flex: 2 },
    { key: "company",   label: t("board.col.company"),         flex: 2 },
    { key: "reason",    label: t("board.col.rejectionReason"), flex: 2 },
    { key: "score",     label: t("board.col.match"),           flex: 1 },
  ];

  return (
    <div style={{ padding: "0 20px 20px", flex: 1, overflow: "auto" }}>
      {/* Header */}
      <div style={{ display: "flex", gap: 12, padding: "8px 12px", borderBottom: "1px solid var(--border)", marginBottom: 2, position: "sticky", top: 0, background: "var(--bg)", zIndex: 1 }}>
        {cols.map(col => (
          <div
            key={col.key}
            onClick={() => toggleSort(col.key)}
            style={{ flex: col.flex, display: "flex", alignItems: "center", gap: 4, cursor: "pointer", userSelect: "none",
              fontSize: 9, fontWeight: 700, color: sortKey === col.key ? "var(--accent)" : "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            {col.label} <SortIcon k={col.key} />
          </div>
        ))}
      </div>
      {/* Rows */}
      {sorted.map(app => (
        <div
          key={app.id}
          onClick={() => onRowClick(app.id)}
          style={{
            display: "flex", gap: 12, padding: "9px 12px", borderRadius: 6, cursor: "pointer",
            borderBottom: "1px solid var(--border-2)",
            background: selectedId === app.id ? "var(--accent-08)" : "transparent",
            boxShadow: selectedId === app.id ? "inset 2px 0 0 var(--accent)" : undefined,
          }}
          onMouseEnter={e => { if (selectedId !== app.id) e.currentTarget.style.background = "var(--surface-2)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = selectedId === app.id ? "var(--accent-08)" : "transparent"; }}
        >
          <div style={{ flex: 3, fontSize: 12, fontWeight: 600, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{app.role}</div>
          <div style={{ flex: 2, fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>{new Date(app.createdAt).toLocaleDateString("de-CH")}</div>
          <div style={{ flex: 2, fontSize: 11, color: "var(--fg-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{app.company}</div>
          <div style={{ flex: 2, fontSize: 11, color: "var(--fg-3)" }}>
            {app.archiveReason ? (ARCHIVE_REASON_LABELS[app.archiveReason] ?? app.archiveReason) : "—"}
          </div>
          <div style={{ flex: 1 }}>
            {app.matchScore != null && (
              <span style={{
                padding: "1px 7px", borderRadius: 999, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)",
                background: app.matchScore >= 75 ? "rgba(52,211,153,0.15)" : app.matchScore >= 50 ? "rgba(251,191,36,0.15)" : "rgba(248,113,113,0.15)",
                color: app.matchScore >= 75 ? "#34d399" : app.matchScore >= 50 ? "#fbbf24" : "#f87171",
              }}>{app.matchScore}%</span>
            )}
          </div>
        </div>
      ))}
      {sorted.length === 0 && (
        <div style={{ textAlign: "center", padding: "56px 0", fontSize: 13, color: "var(--fg-3)" }}>{t("board.noArchived")}</div>
      )}
    </div>
  );
}

export function BoardPage() {
  const { t } = useTranslation();
  const { cardVariant, setCardVariant, isImportModalOpen, setImportModalOpen, selectedApplicationId, setSelectedApplicationId } = useUiStore();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const showArchived = searchParams.get("archive") === "true";
  const [archiveView, setArchiveView] = useState<"kanban" | "table">("table");

  // Search
  const [search, setSearch] = useState("");

  // Main board filters
  const [visibleStages, setVisibleStages] = useState<string[]>([]);
  const [timeFilter, setTimeFilter]       = useState<TimeFilter>("all");
  const [filterOpen, setFilterOpen]       = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Archive filters
  const [reasonFilter, setReasonFilter]   = useState<ReasonFilter>("all");
  const [archiveTime, setArchiveTime]     = useState<TimeFilter>("all");
  const [archiveFilterOpen, setArchiveFilterOpen] = useState(false);
  const archiveFilterRef = useRef<HTMLDivElement>(null);

  const { data: rawApplications = [] } = useQuery<Application[]>({
    queryKey: ["applications", showArchived],
    queryFn: () => api.get(`/api/applications${showArchived ? "?archived=true" : ""}`).then((r) => r.data)
  });

  // Apply client-side filters
  const applications = rawApplications.filter((a) => {
    if (showArchived) {
      // Archive: filter by reason
      if (reasonFilter !== "all") {
        if (reasonFilter === "none" && a.archiveReason) return false;
        if (reasonFilter !== "none" && a.archiveReason !== reasonFilter) return false;
      }
      return matchesTimeFilter(a, archiveTime);
    } else {
      // Board: filter by stage + time
      if (visibleStages.length > 0 && !visibleStages.includes(a.stage)) return false;
      return matchesTimeFilter(a, timeFilter);
    }
  });

  // Search filter applied on top of existing filters
  const displayApplications = search.trim()
    ? applications.filter(a => matchesSearch(a, search))
    : applications;

  const selectedApp = rawApplications.find((a) => a.id === selectedApplicationId) ?? null;

  const isFiltered = showArchived
    ? (reasonFilter !== "all" || archiveTime !== "all")
    : (visibleStages.length > 0 && visibleStages.length < ALL_STAGES.length) || timeFilter !== "all";

  const filterBadgeCount = showArchived
    ? (reasonFilter !== "all" ? 1 : 0) + (archiveTime !== "all" ? 1 : 0)
    : (visibleStages.length > 0 && visibleStages.length < ALL_STAGES.length ? 1 : 0) + (timeFilter !== "all" ? 1 : 0);

  const headerActions = (
    <>
      {/* Archive view toggle */}
      {showArchived && (
        <div style={{ display: "flex", gap: 2, background: "var(--surface-2)", borderRadius: 6, padding: 2 }}>
          <button
            onClick={() => setArchiveView("kanban")}
            title={t("board.kanbanView")}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 4, border: "none", cursor: "pointer",
              background: archiveView === "kanban" ? "var(--surface)" : "transparent",
              color: archiveView === "kanban" ? "var(--fg-1)" : "var(--fg-3)" }}
          >
            <ViewGrid width={13} height={13} />
          </button>
          <button
            onClick={() => setArchiveView("table")}
            title={t("board.tableView")}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 4, border: "none", cursor: "pointer",
              background: archiveView === "table" ? "var(--surface)" : "transparent",
              color: archiveView === "table" ? "var(--fg-1)" : "var(--fg-3)" }}
          >
            <List width={13} height={13} />
          </button>
        </div>
      )}

      {/* Card style selector — only on board (not archive) */}
      {!showArchived && (
        <select
          value={cardVariant}
          onChange={e => setCardVariant(e.target.value as import("../lib/store").CardVariant)}
          title={t("board.cardStyle")}
          style={{
            height: 32, padding: "0 8px", borderRadius: 8, border: "1px solid var(--border)",
            background: "var(--surface)", color: "var(--fg-2)", fontSize: 12,
            fontFamily: "var(--font-sans)", cursor: "pointer", outline: "none",
          }}
        >
          <option value="rich">Rich</option>
          <option value="compact">Compact</option>
          <option value="minimal">Minimal</option>
          <option value="editorial">Editorial</option>
        </select>
      )}

      {/* Filter button — works for both board and archive */}
      <div ref={showArchived ? archiveFilterRef : filterRef} style={{ position: "relative" }}>
        <button
          className="btn btn-secondary"
          onClick={() => showArchived ? setArchiveFilterOpen(v => !v) : setFilterOpen(v => !v)}
          style={{ gap: 6, ...(isFiltered ? { border: "1px solid var(--accent)", background: "var(--accent-08)", color: "var(--accent)" } : {}) }}
        >
          <Settings width={13} height={13} />
          {t("filter")}
          {isFiltered && filterBadgeCount > 0 && (
            <span style={{
              minWidth: 18, height: 18, borderRadius: 999, padding: "0 5px",
              background: "var(--accent)", color: "#fff",
              fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              {filterBadgeCount}
            </span>
          )}
        </button>

        {filterOpen && !showArchived && (
          <FilterDropdown
            visible={visibleStages}
            onChangeStages={setVisibleStages}
            timeFilter={timeFilter}
            onChangeTime={setTimeFilter}
            onClose={() => setFilterOpen(false)}
          />
        )}
        {archiveFilterOpen && showArchived && (
          <ArchiveFilterDropdown
            reasonFilter={reasonFilter}
            onChangeReason={setReasonFilter}
            timeFilter={archiveTime}
            onChangeTime={setArchiveTime}
            onClose={() => setArchiveFilterOpen(false)}
          />
        )}
      </div>

      {!showArchived && (
        <button className="btn btn-primary" onClick={() => setImportModalOpen(true)}>
          <Plus width={13} height={13} /> {t("buttons.import")}
        </button>
      )}
    </>
  );

  return (
    <>
      <Topbar
        title={showArchived ? t("nav.archive") : t("nav.board")}
        sub={showArchived
          ? search.trim()
            ? `${displayApplications.length} ${t("of")} ${applications.length} ${t("board.archived")} ${t("applications")}`
            : `${applications.length} ${t("board.archived")} ${t("applications")}`
          : search.trim()
            ? `${displayApplications.length} ${t("of")} ${applications.length} ${t("applications")}`
            : `${applications.length} ${t("applications")}`}
        searchValue={search}
        onSearchChange={setSearch}
        searchSuggestions={t("search.suggestions", { returnObjects: true }) as string[]}
        actions={headerActions}
      />
      {showArchived ? (
        archiveView === "kanban"
          ? <ArchiveKanban applications={displayApplications} onCardClick={setSelectedApplicationId} selectedId={selectedApplicationId} />
          : <ArchiveTable  applications={displayApplications} onRowClick={setSelectedApplicationId} selectedId={selectedApplicationId} />
      ) : (
        <Board
          applications={displayApplications}
          cardVariant={cardVariant}
          onCardClick={(id) => setSelectedApplicationId(id)}
          visibleStages={visibleStages.length > 0 ? visibleStages : undefined}
          selectedId={selectedApplicationId}
        />
      )}
      {isImportModalOpen && !showArchived && (
        <ImportDrawer onClose={() => setImportModalOpen(false)} />
      )}
      {selectedApp && (
        <DetailDrawer
          key={selectedApp.id}
          app={selectedApp}
          onClose={() => setSelectedApplicationId(null)}
          onArchived={() => { setSelectedApplicationId(null); navigate("/?archive=true"); }}
        />
      )}
    </>
  );
}

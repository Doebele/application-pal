import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Archive, Settings, Plus, Check } from "iconoir-react";
import type { Application } from "@application-pal/shared";
import { api } from "../lib/api";
import { useUiStore } from "../lib/store";
import { Topbar } from "../components/Topbar";
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
const TIME_OPTIONS = [
  { id: "all",   label: "Alle Zeiträume" },
  { id: "1w",    label: "Letzte Woche" },
  { id: "2w",    label: "Letzte 2 Wochen" },
  { id: "1m",    label: "Letzter Monat" },
  { id: "3m",    label: "Letzte 3 Monate" },
  { id: "older5w", label: "Älter als 5 Wochen" },
  { id: "older3m", label: "Älter als 3 Monate" },
] as const;
type TimeFilter = typeof TIME_OPTIONS[number]["id"];

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
const ARCHIVE_REASON_OPTIONS = [
  { id: "all",         label: "Alle Gründe" },
  { id: "unavailable", label: ARCHIVE_REASON_LABELS.unavailable },
  { id: "irrelevant",  label: ARCHIVE_REASON_LABELS.irrelevant },
  { id: "taken",       label: ARCHIVE_REASON_LABELS.taken },
  { id: "other",       label: ARCHIVE_REASON_LABELS.other },
  { id: "none",        label: "Kein Grund angegeben" },
] as const;
type ReasonFilter = typeof ARCHIVE_REASON_OPTIONS[number]["id"];

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

  return (
    <div ref={ref} style={{
      position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 50,
      background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12,
      padding: 8, minWidth: 240, boxShadow: "0 8px 24px rgba(0,0,0,0.18)"
    }}>
      {/* Stages */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px 8px", borderBottom: "1px solid var(--border)", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Phasen</span>
        <button onClick={() => onChangeStages([])} style={{ fontSize: 10, fontWeight: 600, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", padding: "2px 4px" }}>Alle</button>
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
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Zeitraum</span>
      </div>
      {TIME_OPTIONS.map((t) => (
        <button key={t.id} onClick={() => onChangeTime(t.id)} style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "7px 10px", borderRadius: 8, border: "none",
          background: timeFilter === t.id ? "var(--accent-08)" : "transparent",
          cursor: "pointer", fontFamily: "var(--font-sans)", transition: "background 0.1s"
        }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: timeFilter === t.id ? 600 : 400, color: timeFilter === t.id ? "var(--accent)" : "var(--fg-2)", textAlign: "left" }}>{t.label}</span>
          {timeFilter === t.id && <Check width={12} height={12} style={{ color: "var(--accent)" }} />}
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
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} style={{
      position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 50,
      background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12,
      padding: 8, minWidth: 240, boxShadow: "0 8px 24px rgba(0,0,0,0.18)"
    }}>
      {/* Archive reason */}
      <div style={{ padding: "4px 8px 8px", borderBottom: "1px solid var(--border)", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Archivierungsgrund</span>
      </div>
      {ARCHIVE_REASON_OPTIONS.map((r) => (
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
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Zeitraum</span>
      </div>
      {TIME_OPTIONS.map((t) => (
        <button key={t.id} onClick={() => onChangeTime(t.id)} style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "7px 10px", borderRadius: 8, border: "none",
          background: timeFilter === t.id ? "var(--accent-08)" : "transparent",
          cursor: "pointer", fontFamily: "var(--font-sans)", transition: "background 0.1s"
        }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: timeFilter === t.id ? 600 : 400, color: timeFilter === t.id ? "var(--accent)" : "var(--fg-2)", textAlign: "left" }}>{t.label}</span>
          {timeFilter === t.id && <Check width={12} height={12} style={{ color: "var(--accent)" }} />}
        </button>
      ))}
    </div>
  );
}

export function BoardPage() {
  const { cardVariant, isImportModalOpen, setImportModalOpen, selectedApplicationId, setSelectedApplicationId } = useUiStore();
  const [showArchived, setShowArchived] = useState(false);

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

  const selectedApp = rawApplications.find((a) => a.id === selectedApplicationId) ?? null;

  const isFiltered = showArchived
    ? (reasonFilter !== "all" || archiveTime !== "all")
    : (visibleStages.length > 0 && visibleStages.length < ALL_STAGES.length) || timeFilter !== "all";

  const filterBadgeCount = showArchived
    ? (reasonFilter !== "all" ? 1 : 0) + (archiveTime !== "all" ? 1 : 0)
    : (visibleStages.length > 0 && visibleStages.length < ALL_STAGES.length ? 1 : 0) + (timeFilter !== "all" ? 1 : 0);

  const headerActions = (
    <>
      <button
        onClick={() => { setShowArchived(v => !v); setSelectedApplicationId(null); }}
        className="btn btn-secondary"
        style={{ gap: 6, ...(showArchived ? { border: "1px solid var(--accent)", background: "var(--accent-08)", color: "var(--accent)" } : {}) }}
      >
        <Archive width={13} height={13} /> Archiv
      </button>

      {/* Filter button — works for both board and archive */}
      <div ref={showArchived ? archiveFilterRef : filterRef} style={{ position: "relative" }}>
        <button
          className="btn btn-secondary"
          onClick={() => showArchived ? setArchiveFilterOpen(v => !v) : setFilterOpen(v => !v)}
          style={{ gap: 6, ...(isFiltered ? { border: "1px solid var(--accent)", background: "var(--accent-08)", color: "var(--accent)" } : {}) }}
        >
          <Settings width={13} height={13} />
          Filter
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
          <Plus width={13} height={13} /> Import Job
        </button>
      )}
    </>
  );

  return (
    <>
      <Topbar
        title={showArchived ? "Archiv" : "Board"}
        sub={`${applications.length} ${showArchived ? "archivierte" : ""} Bewerbungen`}
        actions={headerActions}
      />
      <Board
        applications={applications}
        cardVariant={cardVariant}
        onCardClick={(id) => setSelectedApplicationId(id)}
        visibleStages={showArchived ? undefined : (visibleStages.length > 0 ? visibleStages : undefined)}
      />
      {isImportModalOpen && !showArchived && (
        <ImportDrawer onClose={() => setImportModalOpen(false)} />
      )}
      {selectedApp && (
        <DetailDrawer
          app={selectedApp}
          onClose={() => setSelectedApplicationId(null)}
        />
      )}
    </>
  );
}

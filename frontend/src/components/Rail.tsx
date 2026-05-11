import { useState, useRef, useEffect } from "react";
import {
  LayoutDashboard, Calendar, List, Files, Settings,
  PanelLeft, Sun, Moon, Gauge, Armchair, UserCircle, FolderOpen, Database
} from "lucide-react";
import { NavLink } from "react-router-dom";
import type { Application } from "@application-pal/shared";
import { useUiStore } from "../lib/store";

const RAIL_EXPANDED  = 220;
const RAIL_COLLAPSED = 52;

const STAGES = [
  { id: "import_validating", title: "Inbox" },
  { id: "preparing_cv",      title: "Preparing CV" },
  { id: "preparing_letter",  title: "Preparing Letter" },
  { id: "application_sent",  title: "Submitted" },
  { id: "pending",           title: "Pending" },
  { id: "interview_1",       title: "1st Interview" },
  { id: "interview_2",       title: "2nd Interview" },
  { id: "rejected",          title: "Rejected" },
  { id: "accepted",          title: "Accepted" },
];

// ── Tooltip shown on hover when rail is collapsed ─────────────
function RailTooltip({ label, visible }: { label: string; visible: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        left: RAIL_COLLAPSED + 8,
        top: "50%",
        transform: "translateY(-50%)",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "5px 10px",
        fontSize: 12,
        fontWeight: 600,
        color: "var(--fg-1)",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        zIndex: 200,
        boxShadow: "var(--shadow-card)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.12s ease",
      }}
    >
      {label}
    </div>
  );
}

// ── Single rail button ────────────────────────────────────────
function RailBtn({
  icon,
  label,
  active,
  onClick,
  open,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  open: boolean;
  badge?: string | number;
}) {
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);

  const handleMouseEnter = () => {
    setHovered(true);
    if (!open) {
      timerRef.current = setTimeout(() => setTooltipVisible(true), 600);
    }
  };
  const handleMouseLeave = () => {
    setHovered(false);
    setTooltipVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        className={"rail-btn" + (active ? " active" : "")}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ justifyContent: open ? "flex-start" : "center" }}
        title={open ? undefined : label}
      >
        <span className="rail-icon">{icon}</span>
        {open && (
          <span className="rail-btn-label" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {label}
          </span>
        )}
        {open && badge != null && (
          <span className="rail-badge">{badge}</span>
        )}
      </button>
      {!open && <RailTooltip label={label} visible={tooltipVisible} />}
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────
function RailSection({ label, open }: { label: string; open: boolean }) {
  if (!open) return null;
  return (
    <div className="rail-section-label">{label}</div>
  );
}

// ── Main Rail ─────────────────────────────────────────────────
type Props = { applications: Application[] };

export function Rail({ applications }: Props) {
  const { railOpen, toggleRail, theme, toggleTheme, density, toggleDensity } = useUiStore();

  const countByStage = (id: string) => applications.filter((a) => a.stage === id).length;

  const navItems = [
    { to: "/",           label: "Board",      icon: <LayoutDashboard size={15} />, count: applications.length },
    { to: "/profile",    label: "Profil",     icon: <UserCircle size={15} /> },
    { to: "/documents",  label: "Dokumente",  icon: <FolderOpen size={15} /> },
    { to: "/knowledge",  label: "Knowledge",  icon: <Database size={15} /> },
    { to: "/calendar",   label: "Calendar",   icon: <Calendar size={15} /> },
    { to: "/timeline",   label: "Timeline",   icon: <List size={15} /> },
    { to: "/templates",  label: "Templates",  icon: <Files size={15} /> },
    { to: "/settings",   label: "Settings",   icon: <Settings size={15} /> },
  ];

  return (
    <aside
      className="rail"
      style={{
        width: railOpen ? RAIL_EXPANDED : RAIL_COLLAPSED,
        transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* ── Header ── */}
      <div className="rail-header">
        {railOpen && (
          <div className="brand" style={{ flex: 1, minWidth: 0 }}>
            <div className="brand-mark">A</div>
            <div className="brand-name" style={{ overflow: "hidden", whiteSpace: "nowrap" }}>
              App<em>·</em>Pal
            </div>
          </div>
        )}
        <button
          className="rail-toggle-btn"
          onClick={toggleRail}
          title={railOpen ? "Collapse sidebar" : "Expand sidebar"}
          style={{ transform: railOpen ? "none" : "scaleX(-1)" }}
        >
          <PanelLeft size={15} />
        </button>
      </div>

      {/* ── Workspace nav ── */}
      <div className="rail-body">
        <RailSection label="WORKSPACE" open={railOpen} />
        <div className="rail-section">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              style={{ textDecoration: "none", display: "block", position: "relative" }}
            >
              {({ isActive }) => (
                <RailBtn
                  icon={item.icon}
                  label={item.label}
                  active={isActive}
                  open={railOpen}
                  badge={item.count}
                />
              )}
            </NavLink>
          ))}
        </div>

        {/* ── Pipeline ── */}
        <RailSection label="PIPELINE" open={railOpen} />
        <div className="rail-section">
          {STAGES.map((stage) => {
            const count = countByStage(stage.id);
            return (
              <NavLink
                key={stage.id}
                to={`/?stage=${stage.id}`}
                style={{ textDecoration: "none", display: "block", position: "relative" }}
              >
                {() => (
                  <RailBtn
                    icon={
                      <span
                        style={{
                          width: 9, height: 9, borderRadius: 2,
                          background: `var(--stage-color-${stage.id})`,
                          display: "inline-block", flexShrink: 0
                        }}
                      />
                    }
                    label={stage.title}
                    open={railOpen}
                    badge={count}
                  />
                )}
              </NavLink>
            );
          })}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="rail-footer-section">
        {/* Density toggle */}
        {railOpen ? (
          <div className="rail-density-row">
            <button
              className={"rail-density-btn" + (density === "high" ? " active" : "")}
              onClick={() => density !== "high" && toggleDensity()}
              title="High density"
            >
              <Gauge size={13} />
              <span>High</span>
            </button>
            <button
              className={"rail-density-btn" + (density === "low" ? " active" : "")}
              onClick={() => density !== "low" && toggleDensity()}
              title="Low density"
            >
              <Armchair size={13} />
              <span>Low</span>
            </button>
          </div>
        ) : (
          <RailBtn
            icon={density === "high" ? <Gauge size={15} /> : <Armchair size={15} />}
            label={density === "high" ? "High density" : "Low density"}
            onClick={toggleDensity}
            open={false}
          />
        )}

        {/* Theme toggle */}
        {railOpen ? (
          <div className="rail-theme-row">
            <button
              className={"rail-density-btn" + (theme === "light" ? " active" : "")}
              onClick={() => theme !== "light" && toggleTheme()}
              title="Light mode"
            >
              <Sun size={13} />
              <span>Light</span>
            </button>
            <button
              className={"rail-density-btn" + (theme === "dark" ? " active" : "")}
              onClick={() => theme !== "dark" && toggleTheme()}
              title="Dark mode"
            >
              <Moon size={13} />
              <span>Dark</span>
            </button>
          </div>
        ) : (
          <RailBtn
            icon={theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
            label={theme === "dark" ? "Dark mode" : "Light mode"}
            onClick={toggleTheme}
            open={false}
          />
        )}

        {/* User */}
        <div className={"rail-user" + (railOpen ? "" : " rail-user-collapsed")}>
          <div className="avatar" style={{ background: "var(--accent)", flexShrink: 0, border: "none" }}>U</div>
          {railOpen && (
            <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>User</div>
              <div style={{ fontSize: 10, color: "var(--fg-3)" }}>{applications.length} active</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

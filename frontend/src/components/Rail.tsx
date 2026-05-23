import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  DashboardDots, Calendar, List, MultiplePages, Settings, Table2Columns,
  SidebarCollapse, SunLight, HalfMoon, DashboardSpeed, Sofa, ProfileCircle, Folder, Database, Archive,
  LogOut, SwitchOff, WarningCircle, Globe,
} from "iconoir-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Application } from "@application-pal/shared";
import { useUiStore } from "../lib/store";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
// @ts-ignore
import deFlagUrl from "round-flag-icons/flags/de.svg?url";
// @ts-ignore
import gbFlagUrl from "round-flag-icons/flags/gb.svg?url";

function FlagIcon({ lang, size = 15 }: { lang: string; size?: number }) {
  return (
    <img
      src={lang === "de" ? deFlagUrl : gbFlagUrl}
      width={size}
      height={size}
      style={{ borderRadius: "50%", display: "block", flexShrink: 0, objectFit: "cover" }}
      alt={lang}
    />
  );
}

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
  icon, label, active, onClick, open, badge,
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

// ── User modal (portal — anchored above the rail-user button) ─
function UserModal({
  email,
  applicationCount,
  anchorRef,
  onClose,
  onLogout,
  onSwitch,
}: {
  email: string;
  applicationCount: number;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onLogout: () => void;
  onSwitch: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const { t } = useTranslation();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) onClose();
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [onClose, anchorRef]);

  // Position: anchored above the trigger element
  const rect = anchorRef.current?.getBoundingClientRect();
  const top  = (rect?.top ?? 0) - 8;
  const left = (rect?.right ?? 0) + 10;

  const initials = email.slice(0, 2).toUpperCase();

  return createPortal(
    <div
      ref={ref}
      style={{
        position: "fixed",
        left,
        top,
        transform: "translateY(-100%)",
        width: 240,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "var(--shadow-modal)",
        zIndex: 9999,
        overflow: "hidden",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* User info header */}
      <div style={{
        padding: "14px 16px 12px",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: "50%",
          background: "var(--accent)", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, color: "#fff",
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: "var(--fg-1)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {email}
          </div>
          <div style={{ fontSize: 10, color: "var(--fg-3)", marginTop: 1 }}>
            {t("user.applications", { count: applicationCount })}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: "6px 6px 6px" }}>
        {/* Switch user */}
        <button
          onClick={onSwitch}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            width: "100%", padding: "8px 10px", borderRadius: 7,
            border: "none", background: "transparent", cursor: "pointer",
            fontFamily: "var(--font-sans)", textAlign: "left",
            transition: "background 0.1s",
            color: "var(--fg-2)",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <SwitchOff width={14} height={14} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 500 }}>{t("user.switchUser")}</span>
        </button>

        {/* Logout — two-step confirmation */}
        {!confirmLogout ? (
          <button
            onClick={() => setConfirmLogout(true)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              width: "100%", padding: "8px 10px", borderRadius: 7,
              border: "none", background: "transparent", cursor: "pointer",
              fontFamily: "var(--font-sans)", textAlign: "left",
              transition: "background 0.1s",
              color: "var(--fg-2)",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <LogOut width={14} height={14} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 500 }}>{t("user.logout")}</span>
          </button>
        ) : (
          <div style={{
            padding: "10px 10px 8px",
            borderRadius: 8,
            background: "rgba(248,113,113,0.07)",
            border: "1px solid rgba(248,113,113,0.2)",
            margin: "2px 0",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <WarningCircle width={13} height={13} style={{ color: "#f87171", flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "var(--fg-2)", lineHeight: 1.4 }}>
                {t("user.confirmLogout")}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={onLogout}
                style={{
                  flex: 1, padding: "5px 0", borderRadius: 6,
                  border: "none", background: "#ef4444", color: "#fff",
                  cursor: "pointer", fontFamily: "var(--font-sans)",
                  fontSize: 11, fontWeight: 600,
                }}
              >
                {t("user.logout")}
              </button>
              <button
                onClick={() => setConfirmLogout(false)}
                style={{
                  flex: 1, padding: "5px 0", borderRadius: 6,
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--fg-2)", cursor: "pointer",
                  fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 500,
                }}
              >
                {t("buttons.cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ── Main Rail ─────────────────────────────────────────────────
type Props = { applications: Application[] };

export function Rail({ applications }: Props) {
  const { railOpen, toggleRail, theme, toggleTheme, density, toggleDensity, uiLanguage, setUiLanguage } = useUiStore();
  const { i18n, t } = useTranslation();
  const { user, logout } = useAuth();

  const changeLanguage = async (lang: "de" | "en") => {
    setUiLanguage(lang);
    await i18n.changeLanguage(lang);
    try { await api.patch("/api/profile", { uiLanguage: lang }); } catch { /* silent */ }
  };
  const location  = useLocation();
  const navigate  = useNavigate();

  const [userModalOpen, setUserModalOpen] = useState(false);
  const userBtnRef = useRef<HTMLDivElement>(null);

  const countByStage = (id: string) => applications.filter((a) => a.stage === id).length;
  const isArchive = location.pathname === "/" && new URLSearchParams(location.search).get("archive") === "true";

  const handleLogout = async () => {
    setUserModalOpen(false);
    await logout();
    navigate("/setup");
  };

  const handleSwitchUser = () => {
    setUserModalOpen(false);
    navigate("/setup");
  };

  // Ordered nav items — labels via i18n
  const navItems = [
    { to: "/",           label: t("nav.board"),     icon: <DashboardDots  width={15} height={15} />, count: applications.filter(a => a.stage !== undefined).length },
    { to: "/table",      label: t("nav.list"),      icon: <Table2Columns  width={15} height={15} /> },
    { to: "/calendar",   label: t("nav.calendar"),  icon: <Calendar       width={15} height={15} /> },
    { to: "/timeline",   label: t("nav.timeline"),  icon: <List           width={15} height={15} /> },
    { to: "/profile",    label: t("nav.profile"),   icon: <ProfileCircle  width={15} height={15} /> },
    { to: "/documents",  label: t("nav.documents"), icon: <Folder         width={15} height={15} /> },
    { to: "/knowledge",  label: t("nav.knowledge"), icon: <Database       width={15} height={15} /> },
    { to: "/templates",  label: t("nav.templates"), icon: <MultiplePages  width={15} height={15} /> },
    { to: "/settings",   label: t("nav.settings"),  icon: <Settings       width={15} height={15} /> },
  ];

  const email = user?.email ?? "";
  const initials = email.slice(0, 2).toUpperCase() || "U";

  return (
    <>
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
            title={railOpen ? t("rail.collapseSidebar") : t("rail.expandSidebar")}
            style={{ transform: railOpen ? "none" : "scaleX(-1)" }}
          >
            <SidebarCollapse width={15} height={15} />
          </button>
        </div>

        {/* ── Workspace nav ── */}
        <div className="rail-body">
          <RailSection label={t("nav.workspace")} open={railOpen} />
          <div className="rail-section">
            {navItems.map((item, idx) => (
              <>
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
                      active={item.to === "/" ? (isActive && !isArchive) : isActive}
                      open={railOpen}
                      badge={item.count}
                    />
                  )}
                </NavLink>
                {/* Insert Archive after Timeline (index 2) */}
                {idx === 2 && (
                  <div key="archive" style={{ position: "relative" }}>
                    <RailBtn
                      icon={<Archive width={15} height={15} />}
                      label={t("nav.archive")}
                      active={isArchive}
                      onClick={() => navigate(isArchive ? "/" : "/?archive=true")}
                      open={railOpen}
                    />
                  </div>
                )}
              </>
            ))}
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
                title={t("rail.highDensity")}
              >
                <DashboardSpeed width={13} height={13} />
                <span>{t("rail.highDensity")}</span>
              </button>
              <button
                className={"rail-density-btn" + (density === "low" ? " active" : "")}
                onClick={() => density !== "low" && toggleDensity()}
                title={t("rail.lowDensity")}
              >
                <Sofa width={13} height={13} />
                <span>{t("rail.lowDensity")}</span>
              </button>
            </div>
          ) : (
            <RailBtn
              icon={density === "high" ? <DashboardSpeed width={15} height={15} /> : <Sofa width={15} height={15} />}
              label={density === "high" ? t("rail.highDensity") : t("rail.lowDensity")}
              onClick={toggleDensity}
              open={false}
            />
          )}

          {/* Language toggle */}
          {railOpen ? (
            <div className="rail-theme-row">
              <button
                className={"rail-density-btn" + (uiLanguage === "de" ? " active" : "")}
                onClick={() => changeLanguage("de")}
                title="Deutsch"
              >
                <FlagIcon lang="de" size={13} />
                <span>DE</span>
              </button>
              <button
                className={"rail-density-btn" + (uiLanguage === "en" ? " active" : "")}
                onClick={() => changeLanguage("en")}
                title="English"
              >
                <FlagIcon lang="en" size={13} />
                <span>EN</span>
              </button>
            </div>
          ) : (
            <RailBtn
              icon={<Globe width={15} height={15} />}
              label={uiLanguage.toUpperCase()}
              onClick={() => changeLanguage(uiLanguage === "de" ? "en" : "de")}
              open={false}
            />
          )}

          {/* Theme toggle */}
          {railOpen ? (
            <div className="rail-theme-row">
              <button
                className={"rail-density-btn" + (theme === "light" ? " active" : "")}
                onClick={() => theme !== "light" && toggleTheme()}
                title={t("rail.lightMode")}
              >
                <SunLight width={13} height={13} />
                <span>{t("rail.lightMode")}</span>
              </button>
              <button
                className={"rail-density-btn" + (theme === "dark" ? " active" : "")}
                onClick={() => theme !== "dark" && toggleTheme()}
                title={t("rail.darkMode")}
              >
                <HalfMoon width={13} height={13} />
                <span>{t("rail.darkMode")}</span>
              </button>
            </div>
          ) : (
            <RailBtn
              icon={theme === "dark" ? <HalfMoon width={15} height={15} /> : <SunLight width={15} height={15} />}
              label={theme === "dark" ? t("rail.darkMode") : t("rail.lightMode")}
              onClick={toggleTheme}
              open={false}
            />
          )}

          {/* User — clickable, opens modal */}
          <div
            ref={userBtnRef}
            className={"rail-user" + (railOpen ? "" : " rail-user-collapsed")}
            onClick={() => setUserModalOpen((v) => !v)}
            style={{
              cursor: "pointer",
              borderRadius: 8,
              border: userModalOpen ? "1px solid var(--border)" : "1px solid transparent",
              background: userModalOpen ? "var(--surface-2)" : "transparent",
              transition: "background 0.12s, border-color 0.12s",
            }}
            title={railOpen ? undefined : email || t("user.account")}
            onMouseEnter={e => { if (!userModalOpen) e.currentTarget.style.background = "var(--surface-2)"; }}
            onMouseLeave={e => { if (!userModalOpen) e.currentTarget.style.background = "transparent"; }}
          >
            <div
              className="avatar"
              style={{ background: "var(--accent)", flexShrink: 0, border: "none", fontSize: 11, fontWeight: 700 }}
            >
              {initials}
            </div>
            {railOpen && (
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                <div style={{
                  fontSize: 12, fontWeight: 600, color: "var(--fg-1)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {email || t("user.account")}
                </div>
                <div style={{ fontSize: 10, color: "var(--fg-3)" }}>
                  {applications.length} {t("user.active")}
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* User modal */}
      {userModalOpen && (
        <UserModal
          email={email}
          applicationCount={applications.length}
          anchorRef={userBtnRef}
          onClose={() => setUserModalOpen(false)}
          onLogout={handleLogout}
          onSwitch={handleSwitchUser}
        />
      )}
    </>
  );
}

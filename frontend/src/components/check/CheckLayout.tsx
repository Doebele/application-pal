// Page shell shared by the CV-Check and the LinkedIn-Check: content area on the left
// (PDF or structured view), a tabbed sidebar on the right, and the "large" view
// (Expand-Logik) for either side. Layout lives in check.css (`chk-shell-*`), so the
// shell maps 1:1 to a Figma frame with variants (sidebar open/closed, large main/side).
import { useState, useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Expand, Collapse, SidebarCollapse, SidebarExpand, RefreshCircle } from "iconoir-react";
import "./check.css";

export const readStored = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v) as T; } catch { return fallback; }
};
export const writeStored = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } };

export type LargeTarget = "main" | "side" | null;

/**
 * Sidebar open/closed and active tab (both remembered per page under `storageKey`),
 * plus the large view, which Escape leaves.
 */
export function useCheckShell<T extends string>(storageKey: string, defaultTab: T) {
  const [sidebarOpen, setSidebarOpenState] = useState(() => readStored(`${storageKey}-sidebar`, true));
  const [tab, setTabState] = useState<T>(() => readStored<T>(`${storageKey}-tab`, defaultTab));
  const [large, setLarge] = useState<LargeTarget>(null);

  useEffect(() => {
    if (!large) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLarge(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [large]);

  const setSidebarOpen = (v: boolean) => {
    setSidebarOpenState(v); writeStored(`${storageKey}-sidebar`, v);
    if (!v && large === "side") setLarge(null);
  };
  const setTab = (v: T) => { setTabState(v); writeStored(`${storageKey}-tab`, v); };
  const toggleLarge = (target: Exclude<LargeTarget, null>) => setLarge(l => (l === target ? null : target));
  return { sidebarOpen, setSidebarOpen, tab, setTab, large, setLarge, toggleLarge };
}

/** Topbar button that shows/hides the sidebar. */
export function SidebarToggle({ open, onToggle }: { open: boolean; onToggle: (v: boolean) => void }) {
  const { t } = useTranslation();
  const p = { width: 15, height: 15, style: { transform: "scaleX(-1)" } };
  return (
    <button className="btn btn-ghost btn-icon chk-icon-btn" data-size="lg" onClick={() => onToggle(!open)} aria-pressed={open}
      title={open ? t("check.shell.hideSidebar") : t("check.shell.showSidebar")}>
      {open ? <SidebarCollapse {...p} /> : <SidebarExpand {...p} />}
    </button>
  );
}

/** Row below the topbar holding the content area and the sidebar. */
export function CheckBody({ children }: { children: ReactNode }) {
  return <div className="chk-shell">{children}</div>;
}

/** Left content area (PDF / structured profile). */
export function CheckMain({ large, children }: { large?: boolean; children: ReactNode }) {
  return <section className={`chk-shell-main${large ? " chk-large" : ""}`}>{children}</section>;
}

/** Bordered frame inside the content area, e.g. around the PDF viewer. */
export function CheckFrame({ children }: { children: ReactNode }) {
  return <div className="chk-frame">{children}</div>;
}

export type SideTabDef<T extends string> = { id: T; label: string };

/** Right sidebar with a text tab bar (labels only — they scroll sideways if the panel is too narrow). */
export function CheckSide<T extends string>({ tabs, tab, onTab, large, onLarge, children }: {
  tabs: Array<SideTabDef<T>>; tab: T; onTab: (t: T) => void; large: boolean; onLarge: () => void; children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <aside className={`chk-shell-side${large ? " chk-large" : ""}`}>
      <div className="chk-side-tabs">
        <div className="chk-side-tablist" role="tablist">
          {tabs.map(d => (
            <button key={d.id} role="tab" aria-selected={tab === d.id} className={`tab chk-side-tab${tab === d.id ? " active" : ""}`}
              onClick={() => onTab(d.id)}>
              {d.label}
            </button>
          ))}
        </div>
        <LargeButton large={large} onClick={onLarge} />
      </div>
      <div className="chk-side-body">
        <div className="chk-side-inner">{children}</div>
      </div>
    </aside>
  );
}

export function LargeButton({ large, onClick }: { large: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button className="btn btn-ghost btn-icon chk-icon-btn" onClick={onClick} title={large ? t("check.shell.minimize") : t("check.shell.maximize")}>
      {large ? <Collapse width={13} height={13} /> : <Expand width={13} height={13} />}
    </button>
  );
}

/** Title + meta line above a panel, with optional extra buttons and the large-view toggle. */
export function PanelHeader({ title, meta, large, onLarge, extra }: { title: string; meta?: ReactNode; large: boolean; onLarge: () => void; extra?: ReactNode }) {
  return (
    <div className="chk-panel-head">
      <div className="chk-panel-titles">
        <div className="chk-panel-title">{title}</div>
        {meta && <div className="chk-panel-meta">{meta}</div>}
      </div>
      {extra}
      <LargeButton large={large} onClick={onLarge} />
    </div>
  );
}

export function EmptyState({ icon, text, children }: { icon: ReactNode; text: string; children?: ReactNode }) {
  return (
    <div className="chk-empty">
      {icon}
      <div className="chk-empty-text">{text}</div>
      {children}
    </div>
  );
}

/** Dashed card for a part that is planned but not built yet. */
export function PhasePlaceholder({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="chk-placeholder">
      <div className="chk-placeholder-head">{icon}<div className="eyebrow">{title}</div></div>
      <div className="chk-placeholder-text">{text}</div>
    </div>
  );
}

/** Full-height loading / error state for a check page before its data arrives. */
export function CheckLoading({ error }: { error?: string | null }) {
  return (
    <div className="chk-loading">
      {error
        ? <div className="chk-loading-error">{error}</div>
        : <RefreshCircle width={20} height={20} className="chk-spin" aria-hidden />}
    </div>
  );
}

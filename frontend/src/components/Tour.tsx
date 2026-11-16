// In-app help: per-screen spotlight tours + the "What can the app do?" overview.
// Tours are data (`src/tours/index.ts`); anchors are `data-tour="…"` attributes.
// Progress lives per user in `user_profile.ui_settings.tours` (PATCH /api/settings
// merges shallowly, so we always send the whole `tours` object).
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { NavArrowRight } from "iconoir-react";
import { api } from "../lib/api";
import { useUiStore } from "../lib/store";
import { bodyZoom } from "../lib/zoom";
import { APP_NAME } from "../lib/appName";
import { SCREENS, TOURS, screenForLocation, type ScreenId, type TourStep } from "../tours";

export type TourProgress = { overviewSeen?: boolean } & Partial<Record<ScreenId, "done" | "dismissed">>;

type Ctx = {
  startTour: (id?: ScreenId) => void;
  openOverview: () => void;
  resetAll: () => Promise<void>;
};
const TourCtx = createContext<Ctx>({ startTour: () => {}, openOverview: () => {}, resetAll: async () => {} });
export const useTour = () => useContext(TourCtx);

function isTyping(el: EventTarget | null) {
  const n = el as HTMLElement | null;
  if (!n) return false;
  return n.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(n.tagName);
}

function findTarget(target: string): HTMLElement | null {
  const isSelector = /^[.#[]|[\s>:]/.test(target);
  const sel = isSelector ? target : `[data-tour="${target}"]`;
  const list = Array.from(document.querySelectorAll<HTMLElement>(sel));
  return list.find(el => el.getClientRects().length > 0) ?? null;
}

export function TourProvider({ userId, persona, children }: { userId: string; persona: string | null; children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: progress } = useQuery({
    queryKey: ["tours", userId],
    queryFn: async () => ((await api.get<{ settings: { tours?: TourProgress } | null }>("/api/settings")).data.settings?.tours ?? {}) as TourProgress,
    staleTime: Infinity,
  });
  const [active, setActive] = useState<ScreenId | null>(null);
  const [overview, setOverview] = useState<null | "first" | "normal">(null);

  const save = useCallback((patch: TourProgress | null) => {
    const next = patch === null ? {} : { ...(queryClient.getQueryData<TourProgress>(["tours", userId]) ?? {}), ...patch };
    queryClient.setQueryData(["tours", userId], next);
    return api.patch("/api/settings", { tours: next }).then(() => {}).catch(() => {});
  }, [queryClient, userId]);

  // First start: show the overview once per user (checked on the first load only,
  // so "reset all tours" in Settings takes effect on the next start).
  const checkedFirst = useRef(false);
  useEffect(() => {
    if (!progress || checkedFirst.current) return;
    checkedFirst.current = true;
    if (!progress.overviewSeen) setOverview("first");
  }, [progress]);

  const startTour = useCallback((id?: ScreenId) => {
    setOverview(null);
    setActive(id ?? screenForLocation(location.pathname, location.search));
  }, [location.pathname, location.search]);

  const openOverview = useCallback(() => { setActive(null); setOverview("normal"); }, []);

  const closeOverview = () => {
    if (overview === "first") save({ overviewSeen: true });
    setOverview(null);
  };

  const goAndTour = (id: ScreenId) => {
    if (overview === "first") save({ overviewSeen: true });
    setOverview(null);
    const s = SCREENS.find(x => x.id === id)!;
    navigate(s.to);
    setActive(id);
  };

  // "?" shortcut — not while typing, not while a tour/dialog is open.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || active || overview) return;
      e.preventDefault();
      startTour();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [active, overview, startTour]);

  const value: Ctx = { startTour, openOverview, resetAll: () => save(null) };

  return (
    <TourCtx.Provider value={value}>
      {children}
      {active && (
        <TourOverlay
          key={active}
          screen={active}
          steps={TOURS[active]}
          onEnd={(finished) => { save({ [active]: finished ? "done" : "dismissed" } as TourProgress); setActive(null); }}
        />
      )}
      {overview && (
        <OverviewDialog
          first={overview === "first"}
          persona={persona}
          onClose={closeOverview}
          onPick={goAndTour}
        />
      )}
    </TourCtx.Provider>
  );
}

// ── Spotlight overlay ─────────────────────────────────────────
type Box = { x: number; y: number; w: number; h: number };

function TourOverlay({ screen, steps, onEnd }: { screen: ScreenId; steps: TourStep[]; onEnd: (finished: boolean) => void }) {
  const { t } = useTranslation();
  const [idx, setIdx] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(null);
  const dirRef = useRef<1 | -1>(1);
  const elRef = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const openedDrawer = useRef(false);
  const prevFocus = useRef<Element | null>(document.activeElement);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const step = steps[idx];

  const finish = useCallback((finished: boolean) => {
    if (openedDrawer.current) useUiStore.getState().setSelectedApplicationId(null);
    (prevFocus.current as HTMLElement | null)?.focus?.();
    onEnd(finished);
  }, [onEnd]);

  // Locate the target (waiting up to `waitFor`), skip it when it never shows up.
  useEffect(() => {
    let cancelled = false;
    const started = Date.now();
    const wait = step.waitFor ?? 400;
    setBox(null);
    const tick = () => {
      if (cancelled) return;
      const el = findTarget(step.target);
      if (el) {
        elRef.current = el;
        el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
        measure();
        return;
      }
      if (Date.now() - started < wait) { setTimeout(tick, 80); return; }
      // Missing target → skip in the current direction.
      const n = idx + dirRef.current;
      if (n < 0 || n >= steps.length) { if (dirRef.current > 0) finish(true); else setIdx(0); return; }
      setIdx(n);
    };
    tick();
    return () => { cancelled = true; };
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  const measure = useCallback(() => {
    const el = elRef.current;
    if (!el || !el.isConnected) return;
    const r = el.getBoundingClientRect();
    const z = bodyZoom();
    const pad = 6;
    setBox({ x: r.left / z - pad, y: r.top / z - pad, w: r.width / z + pad * 2, h: r.height / z + pad * 2 });
  }, []);

  useEffect(() => {
    const h = () => measure();
    window.addEventListener("resize", h);
    window.addEventListener("scroll", h, true);
    const iv = setInterval(h, 400); // layout shifts (drawer animation, data loading)
    return () => { window.removeEventListener("resize", h); window.removeEventListener("scroll", h, true); clearInterval(iv); };
  }, [measure]);

  // Tooltip placement: below, else above, else beside.
  useLayoutEffect(() => {
    if (!box || !tipRef.current) return;
    const z = bodyZoom();
    const vw = window.innerWidth / z, vh = window.innerHeight / z;
    const tw = tipRef.current.offsetWidth, th = tipRef.current.offsetHeight;
    let left = Math.min(Math.max(12, box.x + box.w / 2 - tw / 2), vw - tw - 12);
    let top = box.y + box.h + 12;
    if (top + th > vh - 8) top = box.y - th - 12;
    if (top < 8) {
      top = Math.min(Math.max(8, box.y), vh - th - 8);
      left = box.x > tw + 24 ? box.x - tw - 12 : Math.min(box.x + box.w + 12, vw - tw - 12);
    }
    setTipPos({ left, top });
  }, [box, idx]);

  useEffect(() => { if (box) nextRef.current?.focus({ preventScroll: true }); }, [box, idx]);

  const next = () => {
    if (step.clickOnNext) {
      const el = findTarget(step.clickOnNext);
      if (el) { el.click(); openedDrawer.current = true; }
    }
    dirRef.current = 1;
    if (idx >= steps.length - 1) finish(true); else setIdx(idx + 1);
  };
  const back = () => { if (idx > 0) { dirRef.current = -1; setIdx(idx - 1); } };

  // Keys in the capture phase so the drawer's own Escape handler never sees them.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); finish(false); }
      else if (e.key === "ArrowRight" && !isTyping(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); next(); }
      else if (e.key === "ArrowLeft" && !isTyping(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); back(); }
      else if (e.key === "Tab" && tipRef.current) {
        // Keep focus inside the tooltip.
        const f = Array.from(tipRef.current.querySelectorAll<HTMLElement>("button"));
        if (!f.length) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  });

  const screenText = t(`tours.screens.${screen}`);
  const title = t(`tours.steps.${step.textKey}.title`);
  const body = t(`tours.steps.${step.textKey}.body`, { screen: screenText });
  const heading = step.textKey === "common.title"
    ? t(`nav.${SCREENS.find(s => s.id === screen)!.nav}`)
    : title;
  const last = idx === steps.length - 1;

  return createPortal(
    <div className={"tour-root" + (reduced ? " tour-reduced" : "")}>
      <div className="tour-shade" onClick={e => e.stopPropagation()} />
      {box && <div className="tour-hole" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
      {box && (
        <div
          ref={tipRef}
          className="tour-tip"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-tip-title"
          aria-describedby="tour-tip-body"
          style={{ left: tipPos?.left ?? -9999, top: tipPos?.top ?? 0 }}
        >
          <div className="tour-eyebrow">
            {t(`nav.${SCREENS.find(s => s.id === screen)!.nav}`)} · {t("tours.ui.step", { n: idx + 1, total: steps.length })}
          </div>
          <h3 id="tour-tip-title">{heading}</h3>
          <p id="tour-tip-body" aria-live="polite">{body}</p>
          <div className="tour-row">
            <div className="tour-dots" aria-hidden="true">
              {steps.map((_, i) => <span key={i} className={"tour-dot" + (i === idx ? " on" : "")} />)}
            </div>
            <button className="tour-link" onClick={() => finish(false)}>{t("tours.ui.end")}</button>
            {idx > 0 && <button className="btn btn-secondary" onClick={back}>{t("tours.ui.back")}</button>}
            <button ref={nextRef} className="btn btn-primary" onClick={next}>
              {last ? t("tours.ui.done") : t("tours.ui.next")}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

// ── Overview dialog ───────────────────────────────────────────
function OverviewDialog({ first, persona, onClose, onPick }: {
  first: boolean; persona: string | null; onClose: () => void; onPick: (id: ScreenId) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<Element | null>(document.activeElement);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); onClose(); }
    };
    window.addEventListener("keydown", h, true);
    return () => { window.removeEventListener("keydown", h, true); (prevFocus.current as HTMLElement | null)?.focus?.(); };
  }, [onClose]);

  const showLinkedIn = persona === "berufsumsteiger" || persona === "berufseinsteiger";
  const screens = SCREENS.filter(s => s.id !== "linkedin" || showLinkedIn);
  const groups = Array.from(new Set(screens.map(s => s.group)));
  const flow = t("tours.overview.flow", { returnObjects: true }) as string[];

  return createPortal(
    <div className="tour-ov" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="tour-ov-panel" role="dialog" aria-modal="true" aria-labelledby="tour-ov-title">
        <h2 id="tour-ov-title">{first ? t("tours.overview.titleFirst", { app: APP_NAME }) : t("tours.overview.title", { app: APP_NAME })}</h2>
        <p className="tour-ov-lead">{t("tours.overview.lead", { app: APP_NAME })}</p>
        <div className="tour-flow">
          {flow.map((f, i) => (
            <span key={f} style={{ display: "contents" }}>
              {i > 0 && <NavArrowRight width={12} height={12} className="tour-flow-arrow" />}
              <span className="tour-flow-step">{f}</span>
            </span>
          ))}
        </div>
        {groups.map(g => (
          <div key={g} className="tour-ov-group">
            <h4>{g === "groupSystem" ? t("tours.overview.groupSystem") : t(`nav.${g}`)}</h4>
            <div className="tour-tiles">
              {screens.filter(s => s.group === g).map(s => (
                <button key={s.id} className="tour-tile" onClick={() => onPick(s.id)}>
                  <b>{t(`nav.${s.nav}`)}</b>
                  <span>{t(`tours.screens.${s.id}`)}</span>
                  <em>{t("tours.overview.startTour")}</em>
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="tour-ov-foot">
          <small>{t("tours.overview.hint")}</small>
          <button className="btn btn-secondary" onClick={onClose}>{first ? t("tours.overview.later") : t("tours.overview.close")}</button>
          {first && <button className="btn btn-primary" onClick={() => onPick("board")}>{t("tours.overview.startBoard")}</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  RefreshCircle, InfoCircle, Folder, OpenNewWindow, CheckCircle, WarningCircle, Download,
  Expand, Collapse, SidebarCollapse, SidebarExpand, StatsReport, Sparks, Page, Clock,
} from "iconoir-react";
import type { CvDocument, CvLanguage } from "@application-pal/shared";
import { Topbar } from "../components/Topbar";
import { api } from "../lib/api";
import { useUiStore } from "../lib/store";

const LANGS: CvLanguage[] = ["de", "en", "fr"];
const SIDEBAR_WIDTH = "clamp(300px, 36%, 480px)";

type PdfStatus = "missing" | "ok" | "noPdf" | "pdfStale" | "pdfOnly";
type CvSource = {
  documentId: string; name: string; fileType: string; url: string | null; lang: CvLanguage | null;
  modifiedTime: string | null; folderUrl: string | null; reachable: boolean;
  pdf: { name: string; url: string | null; modifiedTime: string } | null;
};
type SourcesResponse = { driveConnected: boolean; sources: CvSource[]; languages: Array<{ lang: CvLanguage; documentId: string | null; status: PdfStatus }> };
type CvStats = { sections: number; positions: number; bullets: number; words: number };
type CurrentVersion = { id: string; lang: CvLanguage; origin: string; note: string | null; createdAt: string; data: CvDocument; versionCount: number; stats: CvStats };
type CurrentResponse = { masterLang: CvLanguage; current: Record<CvLanguage, CurrentVersion | null> };
type ImportWarning = { path: string; text: string };
type ImportJob = { id: string; lang: CvLanguage; status: "running" | "done" | "error"; startedAt: string; finishedAt?: string; error?: string; warnings?: ImportWarning[] };
type VersionMeta = { id: string; lang: CvLanguage; origin: string; note: string | null; createdAt: string; applicationId: string | null };
type SideTab = "score" | "improve" | "structure" | "versions";

const STATUS_COLOR: Record<PdfStatus, string> = {
  ok: "var(--green)", noPdf: "var(--fg-3)", pdfStale: "var(--score-mid)", pdfOnly: "var(--score-mid)", missing: "var(--fg-3)",
};

// "Large" view (Expand-Logik): the section fills app-main below the topbar.
const LARGE_STYLE: React.CSSProperties = {
  position: "absolute", top: 57, left: 0, right: 0, bottom: 0, zIndex: 10,
  background: "var(--bg)", padding: "16px 24px", display: "flex", flexDirection: "column",
};

const errMsg = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

const readStored = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v) as T; } catch { return fallback; }
};
const writeStored = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } };

export function CvCheckPage() {
  const { t, i18n } = useTranslation();
  const { ai } = useUiStore();
  const [sources, setSources] = useState<SourcesResponse | null>(null);
  const [current, setCurrent] = useState<CurrentResponse | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [now, setNow] = useState(Date.now());
  const [importErr, setImportErr] = useState<Partial<Record<CvLanguage, string>>>({});
  const [lang, setLangState] = useState<CvLanguage | null>(() => readStored<CvLanguage | null>("cvcheck-lang", null));
  const [sidebarOpen, setSidebarOpenState] = useState(() => readStored("cvcheck-sidebar", true));
  const [tab, setTabState] = useState<SideTab>(() => readStored<SideTab>("cvcheck-tab", "structure"));
  const [large, setLarge] = useState<"pdf" | "side" | null>(null);
  const [pdfNonce, setPdfNonce] = useState(0);

  const setLang = (l: CvLanguage) => { setLangState(l); writeStored("cvcheck-lang", l); };
  const setSidebarOpen = (v: boolean) => { setSidebarOpenState(v); writeStored("cvcheck-sidebar", v); if (!v && large === "side") setLarge(null); };
  const setTab = (v: SideTab) => { setTabState(v); writeStored("cvcheck-tab", v); };

  const load = useCallback(async () => {
    try {
      const [s, cur] = await Promise.all([
        api.get<SourcesResponse>("/api/cv/sources"),
        api.get<CurrentResponse>("/api/cv/current"),
      ]);
      setSources(s.data); setCurrent(cur.data); setLoadErr(null);
    } catch (e) { setLoadErr(errMsg(e, t("cvCheck.loadError"))); }
  }, [t]);
  useEffect(() => { load(); }, [load]);

  // Imports run as server-side jobs (a local model can take many minutes). Poll while any
  // is running; this also picks up a running import after a reload or tab switch.
  const loadJobs = useCallback(async () => {
    const r = await api.get<ImportJob[]>("/api/cv/import-jobs").catch(() => null);
    if (r) setJobs(r.data);
    return r?.data ?? [];
  }, []);
  useEffect(() => { loadJobs(); }, [loadJobs]);
  const anyRunning = jobs.some(j => j.status === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const iv = setInterval(async () => {
      setNow(Date.now());
      const list = await loadJobs();
      if (!list.some(j => j.status === "running")) load();
    }, 3000);
    return () => clearInterval(iv);
  }, [anyRunning, loadJobs, load]);

  // Escape leaves the large view
  useEffect(() => {
    if (!large) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLarge(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [large]);

  const setMaster = async (l: CvLanguage) => {
    setCurrent(c => c ? { ...c, masterLang: l } : c);
    await api.patch("/api/profile", { cvMasterLang: l }).catch(() => {});
  };

  const runImport = async (l: CvLanguage, documentId: string) => {
    setImportErr(e => ({ ...e, [l]: undefined }));
    try {
      const r = await api.post<ImportJob>("/api/cv/import", { documentId, ai, lang: l });
      setJobs(js => [r.data, ...js.filter(j => j.id !== r.data.id)]);
      setNow(Date.now());
    } catch (e) {
      setImportErr(x => ({ ...x, [l]: errMsg(e, t("cvCheck.importError")) }));
    }
  };

  const fmt = useCallback((iso: string | null) => iso
    ? new Date(iso).toLocaleDateString(i18n.language, { day: "2-digit", month: "2-digit", year: "numeric" })
    : "–", [i18n.language]);

  if (!sources || !current) {
    return (
      <>
        <Topbar title={t("cvCheck.title")} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
          {loadErr
            ? <div style={{ fontSize: 13, color: "#f87171" }}>{loadErr}</div>
            : <RefreshCircle width={20} height={20} style={{ animation: "spin 1s linear infinite", color: "var(--fg-3)" }} />}
        </div>
      </>
    );
  }

  // Shown language: stored choice → master → first language with a source
  const activeLang: CvLanguage = lang
    ?? (sources.languages.find(l => l.lang === current.masterLang && l.documentId) ? current.masterLang : null)
    ?? sources.languages.find(l => l.documentId)?.lang
    ?? current.masterLang;
  const status = sources.languages.find(l => l.lang === activeLang)!;
  const src = sources.sources.find(s => s.documentId === status.documentId) ?? null;
  const ver = current.current[activeLang];
  const job = jobs.find(j => j.lang === activeLang);

  const langSwitch = (
    <div style={{ display: "flex", gap: 2, padding: 2, borderRadius: 8, background: "var(--surface-2)" }} role="tablist" aria-label={t("cvCheck.language")}>
      {LANGS.map(l => {
        const has = !!sources.languages.find(x => x.lang === l)?.documentId;
        return (
          <button key={l} role="tab" aria-selected={activeLang === l} aria-label={l.toUpperCase()} onClick={() => setLang(l)}
            className={`btn ${activeLang === l ? "btn-primary" : "btn-ghost"}`}
            style={{ fontSize: 12, padding: "4px 10px", fontFamily: "var(--font-mono)", opacity: has || activeLang === l ? 1 : 0.5 }}
            title={has ? undefined : t("cvCheck.noSource")}>
            {l.toUpperCase()}{current.masterLang === l && <span style={{ marginLeft: 4, fontSize: 9 }}>★</span>}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <Topbar title={t("cvCheck.title")} sub={t("cvCheck.sub")} actions={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {langSwitch}
          <button className="btn btn-ghost btn-icon" onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? t("cvCheck.hideSidebar") : t("cvCheck.showSidebar")} aria-pressed={sidebarOpen} style={{ padding: 6 }}>
            {sidebarOpen ? <SidebarCollapse width={15} height={15} style={{ transform: "scaleX(-1)" }} /> : <SidebarExpand width={15} height={15} style={{ transform: "scaleX(-1)" }} />}
          </button>
        </div>
      } />

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {/* ── Content: CV as PDF ───────────────────────────────── */}
        <section style={large === "pdf" ? LARGE_STYLE : { flex: 1, minWidth: 280, display: "flex", flexDirection: "column", padding: "16px 20px" }}>
          <PanelHeader
            title={src ? src.name : t("cvCheck.noSource")}
            meta={src ? <>
              <span>{t("cvCheck.pdfLive")} · {fmt(src.modifiedTime)}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: STATUS_COLOR[status.status], fontWeight: 600 }}>
                {status.status === "pdfStale" || status.status === "pdfOnly" ? <WarningCircle width={11} height={11} /> : status.status === "ok" ? <CheckCircle width={11} height={11} /> : null}
                {t(`cvCheck.pdfStatus.${status.status}`)}
              </span>
            </> : null}
            large={large === "pdf"} onLarge={() => setLarge(large === "pdf" ? null : "pdf")}
            extra={src && <>
              <button className="btn btn-ghost btn-icon" style={{ padding: 4 }} onClick={() => setPdfNonce(n => n + 1)} title={t("cvCheck.reloadPdf")}><RefreshCircle width={13} height={13} /></button>
              {src.url && <a className="btn btn-ghost btn-icon" style={{ padding: 4, display: "inline-flex" }} href={src.url} target="_blank" rel="noreferrer" title={t("cvCheck.openSource")}><OpenNewWindow width={13} height={13} /></a>}
            </>}
          />
          <div style={{ flex: 1, minHeight: 0, borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden", background: "var(--surface-2)" }}>
            {src && src.reachable ? (
              <iframe key={`${src.documentId}-${pdfNonce}`} title={src.name}
                src={`/api/cv/pdf?documentId=${encodeURIComponent(src.documentId)}#view=FitH&navpanes=0`}
                style={{ width: "100%", height: "100%", border: 0, display: "block" }} />
            ) : (
              <EmptyState icon={<Page width={22} height={22} />} text={src ? t("cvCheck.unreachable") : t("cvCheck.noSourceHint", { lang: activeLang.toUpperCase() })}>
                <Link to="/documents" className="btn btn-secondary" style={{ fontSize: 12, gap: 5, textDecoration: "none" }}><Folder width={12} height={12} /> {t("cvCheck.linkDocuments")}</Link>
              </EmptyState>
            )}
          </div>
        </section>

        {/* ── Sidebar: scores, improvements, structure, versions ── */}
        {sidebarOpen && (
          <aside style={large === "side" ? LARGE_STYLE : {
            width: SIDEBAR_WIDTH, flexShrink: 0, borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", minHeight: 0, background: "var(--surface)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: large === "side" ? "0 0 0 0" : "8px 12px 0", borderBottom: "1px solid var(--border)" }} role="tablist">
              {([
                ["score", t("cvCheck.tabs.score"), <StatsReport key="i" width={13} height={13} />],
                ["improve", t("cvCheck.tabs.improve"), <Sparks key="i" width={13} height={13} />],
                ["structure", t("cvCheck.tabs.structure"), <Page key="i" width={13} height={13} />],
                ["versions", t("cvCheck.tabs.versions"), <Clock key="i" width={13} height={13} />],
              ] as Array<[SideTab, string, ReactNode]>).map(([id, label, icon]) => (
                <button key={id} role="tab" aria-selected={tab === id} className={`tab${tab === id ? " active" : ""}`}
                  onClick={() => setTab(id)} title={label}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, padding: "8px 8px", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {icon} {(tab === id || large === "side") && label}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-icon" style={{ padding: 4 }} onClick={() => setLarge(large === "side" ? null : "side")}
                title={large === "side" ? t("cvCheck.minimize") : t("cvCheck.maximize")}>
                {large === "side" ? <Collapse width={13} height={13} /> : <Expand width={13} height={13} />}
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: large === "side" ? "16px 0" : 14 }}>
              <div style={large === "side" ? { maxWidth: 860, margin: "0 auto" } : undefined}>
                {tab === "score" && <PhasePlaceholder icon={<StatsReport width={20} height={20} />} title={t("cvCheck.score.title")} text={t("cvCheck.score.placeholder")} />}
                {tab === "improve" && <PhasePlaceholder icon={<Sparks width={20} height={20} />} title={t("cvCheck.improve.title")} text={t("cvCheck.improve.placeholder")} />}
                {tab === "structure" && (
                  <StructureTab
                    lang={activeLang} src={src} status={status.status} ver={ver} job={job} now={now}
                    importErr={importErr[activeLang]} aiReady={ai.provider !== "none"} driveConnected={sources.driveConnected}
                    masterLang={current.masterLang} onSetMaster={setMaster} onImport={runImport} fmt={fmt}
                  />
                )}
                {tab === "versions" && <VersionsTab lang={activeLang} reloadKey={ver?.id ?? ""} fmt={fmt} />}
              </div>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}

function PanelHeader({ title, meta, large, onLarge, extra }: { title: string; meta: ReactNode; large: boolean; onLarge: () => void; extra?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        {meta && <div style={{ fontSize: 11, color: "var(--fg-3)", display: "flex", gap: 10, whiteSpace: "nowrap", overflow: "hidden" }}>{meta}</div>}
      </div>
      {extra}
      <button className="btn btn-ghost btn-icon" style={{ padding: 4 }} onClick={onLarge} title={large ? t("cvCheck.minimize") : t("cvCheck.maximize")}>
        {large ? <Collapse width={13} height={13} /> : <Expand width={13} height={13} />}
      </button>
    </div>
  );
}

function EmptyState({ icon, text, children }: { icon: ReactNode; text: string; children?: ReactNode }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 24, textAlign: "center", color: "var(--fg-3)" }}>
      {icon}
      <div style={{ fontSize: 12, maxWidth: 320, lineHeight: 1.5 }}>{text}</div>
      {children}
    </div>
  );
}

function PhasePlaceholder({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "18px 16px", borderRadius: 10, border: "1px dashed var(--border)", color: "var(--fg-3)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--fg-2)" }}>{icon}<div className="eyebrow">{title}</div></div>
      <div style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-line" }}>{text}</div>
    </div>
  );
}

function StructureTab({ lang, src, status, ver, job, now, importErr, aiReady, driveConnected, masterLang, onSetMaster, onImport, fmt }: {
  lang: CvLanguage; src: CvSource | null; status: PdfStatus; ver: CurrentVersion | null; job: ImportJob | undefined; now: number;
  importErr?: string; aiReady: boolean; driveConnected: boolean; masterLang: CvLanguage;
  onSetMaster: (l: CvLanguage) => void; onImport: (l: CvLanguage, documentId: string) => void; fmt: (iso: string | null) => string;
}) {
  const { t } = useTranslation();
  const running = job?.status === "running";
  const warnings = job?.status === "done" ? job.warnings : undefined;
  const err = importErr ?? (job?.status === "error" ? job.error : undefined);
  const elapsed = () => {
    if (!job) return "";
    const sec = Math.max(0, Math.round((now - Date.parse(job.startedAt)) / 1000));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  };
  const row = (label: string, value: ReactNode) => (
    <>
      <span style={{ color: "var(--fg-3)" }}>{label}</span>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: 8, background: "var(--accent-08)", border: "1px solid var(--accent-15)", fontSize: 12, color: "var(--fg-2)", lineHeight: 1.55 }}>
        <InfoCircle width={14} height={14} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }} />
        <div>{t("cvCheck.infoText")}</div>
      </div>
      {!driveConnected && <div style={{ fontSize: 12, color: "var(--score-mid)" }}>{t("cvCheck.driveDisconnected")}</div>}
      {!aiReady && <div style={{ fontSize: 12, color: "var(--score-mid)" }}>{t("cvCheck.noAi")}</div>}

      {/* Source + app version */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>{t("cvCheck.sourceSection", { lang: lang.toUpperCase() })}</div>
        <div style={{ fontSize: 12, color: "var(--fg-2)", display: "grid", gridTemplateColumns: "92px 1fr", rowGap: 4, columnGap: 8 }}>
          {row(t("cvCheck.source"), src
            ? <>{src.url ? <a href={src.url} target="_blank" rel="noreferrer" style={{ color: "var(--fg-1)" }}>{src.name}</a> : src.name}<span style={{ color: "var(--fg-3)" }}> · {fmt(src.modifiedTime)}</span>
                {src.folderUrl && <a href={src.folderUrl} target="_blank" rel="noreferrer" title={t("cvCheck.openFolder")} style={{ color: "var(--accent)", marginLeft: 6, display: "inline-flex", verticalAlign: "middle" }}><Folder width={11} height={11} /></a>}</>
            : <span style={{ color: "var(--fg-3)" }}>{t("cvCheck.noSource")}</span>)}
          {src?.pdf && row("PDF", <>{src.pdf.url ? <a href={src.pdf.url} target="_blank" rel="noreferrer" style={{ color: "var(--fg-1)" }}>{src.pdf.name}</a> : src.pdf.name}<span style={{ color: "var(--fg-3)" }}> · {fmt(src.pdf.modifiedTime)}</span> <span style={{ color: STATUS_COLOR[status], fontWeight: 600 }}>· {t(`cvCheck.pdfStatus.${status}`)}</span></>)}
          {row(t("cvCheck.appVersion"), ver
            ? <>{t(`cvCheck.origin.${ver.origin}`, ver.origin)} · {fmt(ver.createdAt)}{ver.versionCount > 1 && <span style={{ color: "var(--fg-3)" }}> · {t("cvCheck.versionCount", { count: ver.versionCount })}</span>}</>
            : <span style={{ color: "var(--fg-3)" }}>{t("cvCheck.notImported")}</span>)}
          {ver && row("", <span style={{ color: "var(--fg-3)" }}>{t("cvCheck.statsLine", ver.stats)}</span>)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {src && src.fileType !== "link" && (
            <button className="btn btn-secondary" style={{ fontSize: 12, gap: 5 }} disabled={!aiReady || running} onClick={() => onImport(lang, src.documentId)}>
              {running
                ? <><RefreshCircle width={11} height={11} style={{ animation: "spin 1s linear infinite" }} /> {t("cvCheck.importing")} {elapsed()}</>
                : <><Download width={11} height={11} /> {ver ? t("cvCheck.reimport") : t("cvCheck.import")}</>}
            </button>
          )}
          {masterLang === lang
            ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--accent-15)", color: "var(--accent)", background: "var(--accent-08)" }}>★ {t("cvCheck.master")}</span>
            : <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => onSetMaster(lang)} title={t("cvCheck.masterLangHint")}>☆ {t("cvCheck.makeMaster")}</button>}
        </div>
        {running && <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 6 }}>{t("cvCheck.importSlowHint")}</div>}
        {err && <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>{err}</div>}
        {warnings && (warnings.length === 0
          ? <div style={{ fontSize: 11, color: "var(--green)", marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}><CheckCircle width={12} height={12} /> {t("cvCheck.verbatimOk")}</div>
          : <div style={{ fontSize: 11, color: "var(--score-mid)", marginTop: 8, lineHeight: 1.5 }}>
              <div style={{ fontWeight: 600 }}>{t("cvCheck.verbatimWarn", { count: warnings.length })}</div>
              <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>{warnings.slice(0, 8).map((x, i) => <li key={i}>{x.text}</li>)}</ul>
            </div>)}
      </div>

      {ver && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{t("cvCheck.recognised")}</div>
          <CvPreview cv={ver.data} />
        </div>
      )}
    </div>
  );
}

function VersionsTab({ lang, reloadKey, fmt }: { lang: CvLanguage; reloadKey: string; fmt: (iso: string | null) => string }) {
  const { t } = useTranslation();
  const [list, setList] = useState<VersionMeta[] | null>(null);
  useEffect(() => {
    setList(null);
    api.get<VersionMeta[]>(`/api/cv/versions?lang=${lang}`).then(r => setList(r.data)).catch(() => setList([]));
  }, [lang, reloadKey]);
  if (!list) return <RefreshCircle width={14} height={14} style={{ animation: "spin 1s linear infinite", color: "var(--fg-3)" }} />;
  if (!list.length) return <EmptyState icon={<Clock width={20} height={20} />} text={t("cvCheck.noVersions")} />;
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      {list.map((v, i) => (
        <li key={v.id} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: i === 0 ? "var(--accent-08)" : "transparent", fontSize: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <strong style={{ color: "var(--fg-1)" }}>{t("cvCheck.versionN", { n: list.length - i })}</strong>
            <span style={{ color: "var(--fg-2)" }}>{t(`cvCheck.origin.${v.origin}`, v.origin)}</span>
            <div style={{ flex: 1 }} />
            <span style={{ color: "var(--fg-3)" }}>{fmt(v.createdAt)} {new Date(v.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          {v.note && <div style={{ color: "var(--fg-3)", marginTop: 2 }}>{v.note}</div>}
        </li>
      ))}
    </ol>
  );
}

/** Read-only rendering of the structured CV — shows what the import recognised. */
function CvPreview({ cv }: { cv: CvDocument }) {
  const { t } = useTranslation();
  const b = cv.basics;
  const contact = [b.location, ...b.phones, ...b.emails, b.linkedin, b.website].filter(Boolean);
  return (
    <div style={{ fontSize: 12, color: "var(--fg-1)", lineHeight: 1.5, padding: 12, borderRadius: 8, border: "1px solid var(--border)" }}>
      {b.name && <div style={{ fontSize: 16, fontWeight: 700 }}>{b.name}</div>}
      {contact.length > 0 && <div style={{ color: "var(--fg-2)" }}>{contact.join(" · ")}</div>}
      {b.otherDetails.length > 0 && <div style={{ color: "var(--fg-3)" }}>{t("cvCheck.otherDetails")}: {b.otherDetails.join(" · ")}</div>}
      {b.headline && <div style={{ fontWeight: 600, marginTop: 8 }}>{b.headline}</div>}
      {b.summary && <div style={{ marginTop: 4, color: "var(--fg-2)" }}>{b.summary}</div>}
      {cv.sections.filter(s => s.kind !== "summary").map(s => (
        <div key={s.id} style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div className="eyebrow">{s.title}</div>
            <span style={{ fontSize: 10, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>{s.kind}</span>
          </div>
          {s.items.map(it => (
            <div key={it.id} style={{ marginTop: 6 }}>
              {(it.title || it.org || it.dateText) && (
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    {it.title && <strong>{it.title}</strong>}{it.title && it.org && " · "}{it.org}{it.location && <span style={{ color: "var(--fg-3)" }}> · {it.location}</span>}
                  </div>
                  {it.dateText && <span style={{ color: "var(--fg-3)", whiteSpace: "nowrap" }}>{it.dateText}</span>}
                </div>
              )}
              {it.text && <div style={{ color: "var(--fg-2)" }}>{it.text}</div>}
              {it.bullets.length > 0 && (
                <ul style={{ margin: "2px 0 0 18px", padding: 0 }}>
                  {it.bullets.map(bl => <li key={bl.id}>{bl.text}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

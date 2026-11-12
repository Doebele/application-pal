import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { RefreshCircle, InfoCircle, Folder, OpenNewWindow, CheckCircle, WarningCircle, Download, Page, Clock } from "iconoir-react";
import type { CvDocument, CvLanguage } from "@application-pal/shared";
import { Topbar } from "../components/Topbar";
import { api } from "../lib/api";
import { GooglePickerButton, type PickedFile } from "../lib/googlePicker";
import { useUiStore } from "../lib/store";
import { useCvCheck, ScoreTab, ImproveTab, cvHighlights } from "./CvCheckTabs";
import { PdfViewer } from "../components/check/PdfViewer";
import {
  useCheckShell, readStored, writeStored, SidebarToggle, CheckBody, CheckMain, CheckFrame, CheckSide,
  PanelHeader, EmptyState, CheckLoading,
} from "../components/check/CheckLayout";

const LANGS: CvLanguage[] = ["de", "en", "fr"];

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

const errMsg = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

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
  const { sidebarOpen, setSidebarOpen, tab, setTab, large, toggleLarge } = useCheckShell<SideTab>("cvcheck", "structure");
  const [pdfNonce, setPdfNonce] = useState(0);

  const setLang = (l: CvLanguage) => { setLangState(l); writeStored("cvcheck-lang", l); };

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

  const setMaster = async (l: CvLanguage) => {
    setCurrent(c => c ? { ...c, masterLang: l } : c);
    await api.patch("/api/profile", { cvMasterLang: l }).catch(() => {});
  };

  // Desktop (drive.file): a CV linked only by URL is invisible to the app until the
  // user picks it once in the Google Picker — that grants access to exactly this file.
  const relink = async (documentId: string, f: PickedFile) => {
    await api.patch(`/api/documents/${documentId}`, { url: f.url, fileType: f.mimeType === "application/pdf" ? "pdf" : "gdoc" });
    setPdfNonce(n => n + 1);
    await load();
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

  // Shown language: stored choice → master → first language with a source
  const activeLang: CvLanguage = lang
    ?? (sources?.languages.find(l => l.lang === current?.masterLang && l.documentId) ? current!.masterLang : null)
    ?? sources?.languages.find(l => l.documentId)?.lang
    ?? current?.masterLang ?? "en";
  const check = useCvCheck(activeLang);
  const [activeId, setActiveId] = useState<string | null>(null);
  const checkResult = check.data?.result;
  const highlights = useMemo(() => cvHighlights(checkResult), [checkResult]);
  useEffect(() => { setActiveId(null); }, [activeLang]);

  if (!sources || !current) {
    return (
      <>
        <Topbar title={t("cvCheck.title")} />
        <CheckLoading error={loadErr} />
      </>
    );
  }

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
          <SidebarToggle open={sidebarOpen} onToggle={setSidebarOpen} />
        </div>
      } />

      <CheckBody>
        {/* ── Content: CV as PDF ───────────────────────────────── */}
        <CheckMain large={large === "main"}>
          <PanelHeader
            title={src ? src.name : t("cvCheck.noSource")}
            meta={src ? <>
              <span>{t("cvCheck.pdfLive")} · {fmt(src.modifiedTime)}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: STATUS_COLOR[status.status], fontWeight: 600 }}>
                {status.status === "pdfStale" || status.status === "pdfOnly" ? <WarningCircle width={11} height={11} /> : status.status === "ok" ? <CheckCircle width={11} height={11} /> : null}
                {t(`cvCheck.pdfStatus.${status.status}`)}
              </span>
            </> : null}
            large={large === "main"} onLarge={() => toggleLarge("main")}
            extra={src && <>
              <button className="btn btn-ghost btn-icon chk-icon-btn" onClick={() => setPdfNonce(n => n + 1)} title={t("cvCheck.reloadPdf")}><RefreshCircle width={13} height={13} /></button>
              {src.url && <a className="btn btn-ghost btn-icon chk-icon-btn" style={{ display: "inline-flex" }} href={src.url} target="_blank" rel="noreferrer" title={t("cvCheck.openSource")}><OpenNewWindow width={13} height={13} /></a>}
            </>}
          />
          <CheckFrame>
            {src && src.reachable ? (
              <PdfViewer url={`/api/cv/pdf?documentId=${encodeURIComponent(src.documentId)}`} reloadKey={pdfNonce}
                highlights={highlights} activeId={activeId}
                onPick={id => { setActiveId(id); if (sidebarOpen && !id.includes(":")) setTab("improve"); }} />
            ) : (
              <EmptyState icon={<Page width={22} height={22} />} text={src ? t("cvCheck.unreachableHint", { name: src.name }) : t("cvCheck.noSourceHint", { lang: activeLang.toUpperCase() })}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start" }}>
                  {src && sources.driveConnected && (
                    <GooglePickerButton kind="readable" title={src.name} label={t("cvCheck.repick")} className="btn btn-primary"
                      onPicked={f => relink(src.documentId, f)} />
                  )}
                  <Link to="/documents" className="btn btn-secondary" style={{ fontSize: 12, gap: 5, textDecoration: "none" }}><Folder width={12} height={12} /> {t("cvCheck.linkDocuments")}</Link>
                </div>
              </EmptyState>
            )}
          </CheckFrame>
        </CheckMain>

        {/* ── Sidebar: scores, improvements, structure, versions ── */}
        {sidebarOpen && (
          <CheckSide<SideTab> tab={tab} onTab={setTab} large={large === "side"} onLarge={() => toggleLarge("side")} tabs={[
            { id: "score", label: t("cvCheck.tabs.score") },
            { id: "improve", label: t("cvCheck.tabs.improve") },
            { id: "structure", label: t("cvCheck.tabs.structure") },
            { id: "versions", label: t("cvCheck.tabs.versions") },
          ]}>
                {tab === "score" && <ScoreTab s={check} hasVersion={!!ver} fmt={fmt} />}
                {tab === "improve" && <ImproveTab s={check} hasVersion={!!ver} fmt={fmt} activeId={activeId} onSelect={setActiveId} />}
                {tab === "structure" && (
                  <StructureTab
                    lang={activeLang} src={src} status={status.status} ver={ver} job={job} now={now}
                    importErr={importErr[activeLang]} aiReady={ai.provider !== "none"} driveConnected={sources.driveConnected}
                    masterLang={current.masterLang} onSetMaster={setMaster} onImport={runImport} fmt={fmt}
                  />
                )}
                {tab === "versions" && <VersionsTab lang={activeLang} reloadKey={ver?.id ?? ""} fmt={fmt} />}
          </CheckSide>
        )}
      </CheckBody>
    </>
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

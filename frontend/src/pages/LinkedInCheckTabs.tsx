// LinkedIn-Check: data hook + sidebar tabs (Bewertung, KI-Werkzeuge, Quelle & Ziel).
// Reuses the shared check components; LinkedIn-specific bits (self-report rows, effort
// tags, headline variants) are styled in components/linkedin/linkedin.css.
import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Play, RefreshCircle, Copy, Check, Upload, Page, PasteClipboard, InfoCircle, WarningTriangle, Clock, Link as LinkIcon } from "iconoir-react";
import type { LinkedInProfile } from "@application-pal/shared";
import { api } from "../lib/api";
import { useUiStore } from "../lib/store";
import { copyText } from "../lib/clipboard";
import { TotalScore, AreaBars, CheckRow, RecommendationList, StatusIcon } from "../components/check/CheckComponents";
import { EmptyState } from "../components/check/CheckLayout";
import type { CheckOutcome, AreaStatus, Recommendation } from "../components/check/types";
import "../components/linkedin/linkedin.css";

// ── types (mirror backend/src/linkedin-rules.ts + index.ts) ──
export type LiArea = "firstImpression" | "content" | "evidence" | "activity";
export type LiEffort = "minutes" | "hours" | "weeks";
export type LiArea2 = { score: number; max: number; fullMax: number; status: AreaStatus };
export type LiResult = {
  criteriaVersion: string; checkedAt: string; total: number; rawTotal: number; acceptedGain: number; accepted: string[];
  rated: { score: number; max: number };
  areas: Record<LiArea, LiArea2>;
  ai: { score: number; max: number; fullMax: number; checks: CheckOutcome[] };
  checks: CheckOutcome[];
  steps: Array<{ id: string; label: string; gain: number; effort: LiEffort; detail?: string }>;
  recommendations: Recommendation[];
  notRated: Array<{ id: string; label: string; kind: string; max: number; why: string }>;
  inputs: { source: string; llm: boolean; selfReported: number; targetRole: boolean; missingDomains: string[] };
};
export type LiState = {
  journey?: "check" | "build" | null;
  goal?: { kind?: "job" | "clients" | "switch" | "visibility" | null; targetRole?: string | null; market?: string | null } | null;
  selfReport?: Record<string, number> | null; waivers?: string[] | null; checklist?: string[] | null;
};
type Stats = Record<string, number | null>;
export type LiVersion = { id: string; source: string; note: string | null; createdAt: string; stats: Stats; hasPdf: boolean; profile: LinkedInProfile };
type Judge = { checkedAt: string; error: string | null; cvUsed: boolean; extras: { headlineVariants: Array<{ type: string; text: string }>; cv: { titleConflicts: Array<{ linkedin: string; cv: string }>; missingInLinkedIn: string[] } | null; ndaHints: string[] } };
type CheckResponse = { result: LiResult | null; state: LiState; version: LiVersion | null; judge?: Judge | null };
type Job = { id: string; kind: "check" | "import"; status: "running" | "done" | "error"; step: string; startedAt: string; finishedAt?: string; error?: string; versionId?: string; warnings?: string[]; changed?: boolean };
type VersionMeta = { id: string; origin: string; source: string; note: string | null; createdAt: string; judged: boolean };

const errMsg = (e: unknown, fallback: string) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
const CLOUD = ["anthropic", "openai", "gemini", "openrouter"];

/** Latest check, running jobs (polled every 3 s), and every write the page does. */
export function useLinkedInCheck() {
  const { i18n, t } = useTranslation();
  const { ai } = useUiStore();
  const uiLang = ["de", "en", "fr"].includes(i18n.language) ? i18n.language : "de";
  const [data, setData] = useState<CheckResponse | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try { const r = await api.get<CheckResponse>("/api/linkedin/check", { params: { uiLang } }); setData(r.data); setLoadErr(null); }
    catch (e) { setLoadErr(errMsg(e, t("linkedinCheck.loadError"))); }
  }, [uiLang, t]);
  const loadJobs = useCallback(async () => {
    const r = await api.get<Job[]>("/api/linkedin/jobs").catch(() => null);
    if (r) setJobs(r.data);
    return r?.data ?? [];
  }, []);
  useEffect(() => { load(); loadJobs(); }, [load, loadJobs]);

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

  const startJob = async (p: Promise<{ data: Job }>) => {
    setError(null);
    try { const r = await p; setJobs(js => [r.data, ...js.filter(j => j.id !== r.data.id)]); setNow(Date.now()); }
    catch (e) { setError(errMsg(e, t("linkedinCheck.actionError"))); }
  };
  const runJudge = () => startJob(api.post<Job>("/api/linkedin/check", { ai, uiLang }));
  const importPdf = (file: File) => {
    const fd = new FormData(); fd.append("file", file); fd.append("ai", JSON.stringify(ai));
    return startJob(api.post<Job>("/api/linkedin/import/pdf", fd));
  };
  const importText = (text: string) => startJob(api.post<Job>("/api/linkedin/import/text", { text, ai }));
  const importZip = async (file: File) => {
    setError(null); setBusyKey("zip");
    try { const fd = new FormData(); fd.append("file", file); await api.post("/api/linkedin/import/zip", fd); await load(); }
    catch (e) { setError(errMsg(e, t("linkedinCheck.actionError"))); }
    finally { setBusyKey(null); }
  };

  const patchState = async (patch: Omit<Partial<LiState>, "selfReport"> & { selfReport?: Record<string, number | null> }, key: string) => {
    setBusyKey(key);
    try { await api.patch("/api/linkedin/state", patch); await load(); }
    catch (e) { setError(errMsg(e, t("linkedinCheck.actionError"))); }
    finally { setBusyKey(null); }
  };
  const setSelf = (id: string, v: number | null) => patchState({ selfReport: { [id]: v } }, id);
  const setGoal = (goal: NonNullable<LiState["goal"]>) => patchState({ goal }, "goal");
  const toggleWaiver = async (key: string, accepted: boolean) => {
    setBusyKey(key);
    try { await api.post("/api/linkedin/check/waivers", { key, accepted }); await load(); }
    catch (e) { setError(errMsg(e, t("linkedinCheck.actionError"))); }
    finally { setBusyKey(null); }
  };

  const judgeJob = jobs.find(j => j.kind === "check") ?? null;
  const importJob = jobs.find(j => j.kind === "import") ?? null;
  return {
    data, loadErr, error, busyKey, now, judgeJob, importJob, load,
    judgeRunning: judgeJob?.status === "running", importRunning: importJob?.status === "running",
    runJudge, importPdf, importText, importZip, setSelf, setGoal, toggleWaiver,
    aiReady: ai.provider !== "none", cloud: CLOUD.includes(ai.provider) ? ai.provider : null,
  };
}
export type LiCheckState = ReturnType<typeof useLinkedInCheck>;

const elapsedOf = (job: Job | null, now: number) => {
  if (!job) return "";
  const s = Math.max(0, Math.round((now - Date.parse(job.startedAt)) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// ── groups per area, in LinkedIn order ──
export const AREAS: LiArea[] = ["firstImpression", "content", "evidence", "activity"];
export const AREA_GROUPS: Record<LiArea, string[]> = {
  firstImpression: ["photo", "banner", "headline", "basics"],
  content: ["about", "experience", "featured", "extras"],
  evidence: ["skills", "recommendations", "honors"],
  activity: ["posts", "comments", "network"],
};

/** Self-report answer options per check (points + label key). */
function selfOptions(c: CheckOutcome): Array<[number, string]> {
  if (c.id === "photo") return [[5, "pro"], [3, "ok"], [0, "none"]];
  if (c.id === "banner") return [[5, "custom"], [3, "image"], [0, "default"]];
  return c.max >= 2 ? [[c.max, "yes"], [Math.round(c.max / 2), "partly"], [0, "no"]] : [[c.max, "yes"], [0, "no"]];
}

/** A self-report checkpoint: the user picks what applies; picking the same answer again clears it. */
function SelfRow({ check, value, busy, onSet }: { check: CheckOutcome; value: number | undefined; busy: boolean; onSet: (v: number | null) => void }) {
  const { t } = useTranslation();
  return (
    <div className="chk-row">
      <div className="chk-row-head" style={{ cursor: "default" }}>
        <span style={{ width: 11 }} />
        <StatusIcon status={check.status} />
        <span className="chk-row-label">{check.label}<span className="li-kind">{t("linkedinCheck.kind.self")}</span></span>
        {check.status !== "na" && <span className="chk-row-pts">{check.score} / {check.max}</span>}
      </div>
      <div className="chk-row-body">
        <div className="chk-rule">{check.rule}</div>
        <div className="li-self" role="radiogroup" aria-label={check.label}>
          {selfOptions(check).map(([pts, key]) => (
            <button key={key} type="button" role="radio" aria-checked={value === pts} className="li-self-opt" disabled={busy}
              onClick={() => onSet(value === pts ? null : pts)}>
              {t(`linkedinCheck.self.${key}`)} <span className="li-self-pts">{pts}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function RunBar({ s }: { s: LiCheckState }) {
  const { t, i18n } = useTranslation();
  const judge = s.data?.judge;
  const job = s.judgeJob;
  return (
    <div className="chk-stack" style={{ gap: 8 }}>
      <div className="chk-run">
        <button className="btn btn-primary" style={{ fontSize: 12, gap: 6 }} disabled={!s.data?.version || s.judgeRunning || !s.aiReady} onClick={s.runJudge}>
          {s.judgeRunning ? <RefreshCircle width={12} height={12} className="chk-spin" /> : <Play width={12} height={12} />}
          {s.judgeRunning ? t("linkedinCheck.judge.running") : judge ? t("linkedinCheck.judge.rerun") : t("linkedinCheck.judge.run")}
        </button>
        {s.judgeRunning && job && <span className="chk-muted">{t(`linkedinCheck.judge.step.${job.step}`, job.step)} · {elapsedOf(job, s.now)}</span>}
        {!s.judgeRunning && judge && <span className="chk-muted">{t("linkedinCheck.judge.at", { date: new Date(judge.checkedAt).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }) })}</span>}
      </div>
      {!s.aiReady && <div className="chk-note" data-tone="info">{t("linkedinCheck.judge.noAi")}</div>}
      {s.cloud && <div className="chk-note"><WarningTriangle width={11} height={11} style={{ verticalAlign: -1 }} /> {t("linkedinCheck.judge.cloud", { provider: s.cloud })}</div>}
      {!judge && s.data?.version && !s.judgeRunning && <div className="chk-note" data-tone="info">{t("linkedinCheck.judge.needed")}</div>}
      {s.judgeRunning && <div className="chk-note" data-tone="info">{t("linkedinCheck.judge.slow")}</div>}
      {job?.status === "error" && job.error && <div className="chk-note" data-tone="error">{job.error}</div>}
      {judge?.error && <div className="chk-note" data-tone="error">{t("linkedinCheck.judge.error", { error: judge.error })}</div>}
      {s.error && <div className="chk-note" data-tone="error">{s.error}</div>}
    </div>
  );
}

function EffortTag({ effort }: { effort: LiEffort }) {
  const { t } = useTranslation();
  return <span className="li-effort" data-effort={effort}><Clock width={9} height={9} /> {t(`linkedinCheck.effort.${effort}`)}</span>;
}

/** Bewertung: total (extrapolated) + disclaimer, steps, areas, details incl. self-report, AI visibility. */
export function ScoreTab({ s, focusGroup }: { s: LiCheckState; focusGroup: string | null }) {
  const { t } = useTranslation();
  const res = s.data?.result;
  const self = s.data?.state.selfReport ?? {};
  const focusRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focusGroup) focusRef.current?.scrollIntoView({ behavior: "auto", block: "start" }); }, [focusGroup]);
  if (!s.data?.version || !res) {
    return <div className="chk-card"><div className="chk-muted">{t("linkedinCheck.noProfile")}</div></div>;
  }
  const rows = (checks: CheckOutcome[]) => checks.map(c => c.kind === "self"
    ? <SelfRow key={c.id} check={c} value={self[c.id]} busy={s.busyKey === c.id} onSet={v => s.setSelf(c.id, v)} />
    : <CheckRow key={c.id} check={{ ...c, label: c.status === "na" ? `${c.label} · ${t("linkedinCheck.notRated")}` : c.label }}
        onAccept={s.toggleWaiver} busy={s.busyKey === c.id} defaultOpen={c.group === focusGroup && c.status === "fail"} />);
  return (
    <div className="chk-stack">
      <div className="chk-card chk-stack" style={{ gap: 12 }}>
        <TotalScore total={res.total} rawTotal={res.rawTotal} acceptedGain={res.acceptedGain}>
          <div className="chk-muted">{t("linkedinCheck.rated", { score: Math.round(res.rated.score), max: res.rated.max })}</div>
        </TotalScore>
        <div className="chk-note" data-tone="info"><InfoCircle width={11} height={11} style={{ verticalAlign: -1 }} /> {t("linkedinCheck.disclaimer")}</div>
        <RunBar s={s} />
      </div>

      <div className="chk-card">
        <div className="chk-h">{t("linkedinCheck.steps")}</div>
        {res.steps.length ? (
          <ol className="chk-steps">
            {res.steps.map(st => (
              <li key={st.id} className="chk-step">
                <span className="chk-step-gain">+{Math.round(st.gain)}</span>
                <span style={{ flex: 1 }}>{st.label}{st.detail && <span className="chk-step-detail">{st.detail}</span>}</span>
                <EffortTag effort={st.effort} />
              </li>
            ))}
          </ol>
        ) : <div className="chk-muted">{t("check.noSteps")}</div>}
      </div>

      <div className="chk-card">
        <div className="chk-h">{t("linkedinCheck.areas")}</div>
        <AreaBars areas={AREAS.map(a => ({ id: a, label: `${t(`linkedinCheck.area.${a}`)} · ${t("linkedinCheck.ofFull", { max: res.areas[a].fullMax })}`, ...res.areas[a] }))} />
      </div>

      <div className="chk-card">
        <div className="chk-h">{t("linkedinCheck.details")}</div>
        {AREAS.map(a => AREA_GROUPS[a].map(g => {
          const checks = res.checks.filter(c => c.group === g);
          if (!checks.length) return null;
          return (
            <div key={g} ref={g === focusGroup ? focusRef : undefined} className="li-group" data-focus={g === focusGroup}>
              <div className="chk-group-title">{t(`linkedinCheck.area.${a}`)} · {t(`linkedinCheck.group.${g}`)}</div>
              {rows(checks)}
            </div>
          );
        }))}
      </div>

      <div className="chk-card">
        <div className="chk-h" style={{ justifyContent: "space-between" }}>
          <span>{t("linkedinCheck.aiVisibility")}</span>
          <span className="chk-area-score">{res.ai.score} / {res.ai.max}{res.ai.max < res.ai.fullMax && ` · ${t("linkedinCheck.ofFull", { max: res.ai.fullMax })}`}</span>
        </div>
        <div className="chk-muted" style={{ marginBottom: 6 }}>{t("linkedinCheck.aiVisibilityHint")}</div>
        {rows(res.ai.checks)}
      </div>

      <div className="chk-card">
        <div className="chk-h">{t("linkedinCheck.recommendations")}</div>
        <RecommendationList items={res.recommendations} />
      </div>
    </div>
  );
}

function withPlaceholders(text: string) {
  return text.split(/(\[X\])/g).map((p, i) => (p === "[X]" ? <mark key={i}>[X]</mark> : p));
}
function CopyBtn({ text }: { text: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn btn-ghost btn-icon chk-icon-btn" title={t("check.copy")}
      onClick={async () => { await copyText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>
      {done ? <Check width={11} height={11} /> : <Copy width={11} height={11} />}
    </button>
  );
}

/** KI-Werkzeuge: headline variants from the judge run (more tools follow in phase 3). */
export function ToolsTab({ s }: { s: LiCheckState }) {
  const { t } = useTranslation();
  const judge = s.data?.judge;
  const variants = judge?.extras.headlineVariants ?? [];
  return (
    <div className="chk-stack">
      <div className="chk-card">
        <div className="chk-h">{t("linkedinCheck.tools.headlines")}</div>
        {!judge ? <div className="chk-muted">{t("linkedinCheck.tools.needJudge")}</div>
          : !variants.length ? <div className="chk-muted">{t("linkedinCheck.tools.noVariants")}</div>
          : (
            <div className="chk-stack" style={{ gap: 8 }}>
              <div className="chk-muted">{t("linkedinCheck.tools.placeholderHint")}</div>
              {variants.map((v, i) => (
                <div key={i} className="chk-rewrite">
                  <div className="chk-rewrite-label"><span>{t(`linkedinCheck.tools.variant.${v.type}`, v.type)} · {v.text.length}/220</span><CopyBtn text={v.text} /></div>
                  <div className="chk-rewrite-text">{withPlaceholders(v.text)}</div>
                </div>
              ))}
            </div>
          )}
      </div>
      {judge?.extras.ndaHints.length ? (
        <div className="chk-note"><WarningTriangle width={11} height={11} style={{ verticalAlign: -1 }} /> {t("linkedinCheck.tools.nda", { names: judge.extras.ndaHints.join(", ") })}</div>
      ) : null}
      {judge && !judge.cvUsed && <div className="chk-note" data-tone="info">{t("linkedinCheck.tools.noCv")}</div>}
      <div className="chk-placeholder">
        <div className="chk-placeholder-head"><Page width={14} height={14} /> {t("linkedinCheck.tools.moreTitle")}</div>
        <div className="chk-placeholder-text">{t("linkedinCheck.tools.moreText")}</div>
      </div>
    </div>
  );
}

const GOAL_KINDS = ["job", "switch", "clients", "visibility"] as const;

/** Quelle & Ziel: goal (target role/market), current source, imports, versions. */
export function SourceTab({ s, persona }: { s: LiCheckState; persona: string | null }) {
  const { t, i18n } = useTranslation();
  const goal = s.data?.state.goal ?? {};
  const [role, setRole] = useState(goal.targetRole ?? "");
  const [market, setMarket] = useState(goal.market ?? "");
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
  const ver = s.data?.version;
  useEffect(() => { setRole(goal.targetRole ?? ""); setMarket(goal.market ?? ""); }, [goal.targetRole, goal.market]);
  useEffect(() => { api.get<VersionMeta[]>("/api/linkedin/versions").then(r => setVersions(r.data)).catch(() => setVersions([])); }, [ver?.id]);
  const fmt = (iso: string) => new Date(iso).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" });
  const job = s.importJob;

  const filePick = (accept: string, onFile: (f: File) => void, label: ReactNode, disabled: boolean) => (
    <label className="btn btn-secondary li-btn" aria-disabled={disabled} style={disabled ? { opacity: .5, pointerEvents: "none" } : undefined}>
      {label}
      <input type="file" accept={accept} hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
    </label>
  );

  return (
    <div className="chk-stack">
      {persona === "berufseinsteiger" && <div className="chk-note" data-tone="info">{t("linkedinCheck.source.beginner")}</div>}

      <div className="chk-card chk-stack" style={{ gap: 10 }}>
        <div className="chk-h" style={{ margin: 0 }}>{t("linkedinCheck.goal.title")}</div>
        <div className="li-goal-kinds" role="radiogroup" aria-label={t("linkedinCheck.goal.title")}>
          {GOAL_KINDS.map(k => (
            <button key={k} type="button" role="radio" aria-checked={goal.kind === k} className="li-self-opt"
              onClick={() => s.setGoal({ kind: goal.kind === k ? null : k })}>{t(`linkedinCheck.goal.kind.${k}`)}</button>
          ))}
        </div>
        <label className="li-field">
          <span>{t("linkedinCheck.goal.targetRole")}</span>
          <input className="input-line" value={role} placeholder={t("linkedinCheck.goal.targetRolePh")} onChange={e => setRole(e.target.value)}
            onBlur={() => role !== (goal.targetRole ?? "") && s.setGoal({ targetRole: role.trim() || null })} />
        </label>
        <label className="li-field">
          <span>{t("linkedinCheck.goal.market")}</span>
          <input className="input-line" value={market} placeholder={t("linkedinCheck.goal.marketPh")} onChange={e => setMarket(e.target.value)}
            onBlur={() => market !== (goal.market ?? "") && s.setGoal({ market: market.trim() || null })} />
        </label>
        <div className="chk-muted">{t("linkedinCheck.goal.hint")}</div>
      </div>

      <div className="chk-card chk-stack" style={{ gap: 10 }}>
        <div className="chk-h" style={{ margin: 0 }}>{t("linkedinCheck.source.title")}</div>
        {ver ? (
          <div className="chk-muted" style={{ color: "var(--fg-2)" }}>
            <b>{t(`linkedinCheck.source.kind.${ver.source}`, ver.source)}</b> · {fmt(ver.createdAt)}{ver.note && <> · {ver.note}</>}
          </div>
        ) : <div className="chk-muted">{t("linkedinCheck.noProfile")}</div>}
        <div className="li-actions">
          <Link to="/profile" className="btn btn-secondary li-btn" style={{ textDecoration: "none" }}><LinkIcon width={11} height={11} /> {t("linkedinCheck.source.connection")}</Link>
          {filePick(".zip,application/zip", f => s.importZip(f), <>{s.busyKey === "zip" ? <RefreshCircle width={11} height={11} className="chk-spin" /> : <Upload width={11} height={11} />} {t("linkedinCheck.source.zip")}</>, s.busyKey === "zip")}
          {filePick("application/pdf,.pdf", f => s.importPdf(f), <><Page width={11} height={11} /> {t("linkedinCheck.source.pdf")}</>, s.importRunning || !s.aiReady)}
          <button type="button" className="btn btn-ghost li-btn" disabled={s.importRunning || !s.aiReady} onClick={() => setShowPaste(v => !v)}>
            <PasteClipboard width={11} height={11} /> {t("linkedinCheck.source.text")}
          </button>
        </div>
        {showPaste && (
          <div className="chk-stack" style={{ gap: 6 }}>
            <textarea className="li-token" rows={6} value={paste} placeholder={t("linkedinCheck.source.textPh")} onChange={e => setPaste(e.target.value)} />
            <button type="button" className="btn btn-primary li-btn" style={{ alignSelf: "flex-start" }} disabled={paste.trim().length < 80 || s.importRunning}
              onClick={async () => { await s.importText(paste); setPaste(""); setShowPaste(false); }}>{t("linkedinCheck.source.textGo")}</button>
          </div>
        )}
        <div className="chk-muted">{t("linkedinCheck.source.hint")}</div>
        {s.importRunning && job && <div className="chk-note" data-tone="info"><RefreshCircle width={11} height={11} className="chk-spin" style={{ verticalAlign: -1 }} /> {t("linkedinCheck.source.importing")} · {elapsedOf(job, s.now)}</div>}
        {job?.status === "error" && job.error && <div className="chk-note" data-tone="error">{job.error}</div>}
        {job?.status === "done" && job.warnings && job.warnings.length > 0 && (
          <div className="chk-note"><b>{t("linkedinCheck.source.verbatimWarn", { count: job.warnings.length })}</b>
            <ul className="chk-findings">{job.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>
        )}
        {s.error && <div className="chk-note" data-tone="error">{s.error}</div>}
        <div className="li-privacy"><InfoCircle width={11} height={11} /> {t("linkedinCheck.source.privacy")}</div>
      </div>

      <div className="chk-card">
        <div className="chk-h">{t("linkedinCheck.source.versions")}</div>
        {!versions ? <RefreshCircle width={13} height={13} className="chk-spin" />
          : !versions.length ? <EmptyState icon={<Clock width={18} height={18} />} text={t("linkedinCheck.source.noVersions")} />
          : (
            <ol className="li-versions">
              {versions.map((v, i) => (
                <li key={v.id} data-current={v.id === ver?.id}>
                  <b>{versions.length - i}</b> <span>{t(`linkedinCheck.source.kind.${v.source}`, v.source)}</span>
                  {v.judged && <span className="li-kind">{t("linkedinCheck.source.judged")}</span>}
                  <span className="chk-muted" style={{ marginLeft: "auto" }}>{fmt(v.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
      </div>
    </div>
  );
}

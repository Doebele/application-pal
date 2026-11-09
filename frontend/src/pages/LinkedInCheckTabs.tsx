// LinkedIn-Check: data hook + sidebar tabs (Bewertung, KI-Werkzeuge, Quelle & Ziel).
// Reuses the shared check components; LinkedIn-specific bits (self-report rows, effort
// tags, headline variants) are styled in components/linkedin/linkedin.css.
import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Play, RefreshCircle, Copy, Check, Upload, Page, PasteClipboard, InfoCircle, WarningTriangle, Clock, Link as LinkIcon, Sparks, Xmark, Plus } from "iconoir-react";
import { useQuery } from "@tanstack/react-query";
import type { LinkedInProfile } from "@application-pal/shared";
import { api } from "../lib/api";
import { useUiStore } from "../lib/store";
import { copyText } from "../lib/clipboard";
import { TotalScore, AreaBars, CheckRow, RecommendationList, StatusIcon } from "../components/check/CheckComponents";
import { EmptyState, readStored, writeStored } from "../components/check/CheckLayout";
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
  answers?: Record<string, string> | null;
  positioning?: Record<string, { options: Array<{ text: string; angle?: string | null }>; chosen?: string | null; createdAt?: string | null }> | null;
};
type Stats = Record<string, number | null>;
export type LiVersion = { id: string; source: string; note: string | null; lang: string | null; createdAt: string; stats: Stats; hasPdf: boolean; profile: LinkedInProfile };
type Extras = { headlineVariants: Array<{ type: string; text: string }>; cv: { titleConflicts: Array<{ linkedin: string; cv: string }>; missingInLinkedIn: string[] } | null; ndaHints: string[] };
type Judge = { checkedAt: string; error: string | null; cvUsed: boolean; extras: Extras };
/** One LinkedIn profile language: newest import and/or draft (LinkedIn keeps one profile per language). */
export type LiLangInfo = { lang: string; importId: string | null; importedAt: string | null; source: string | null; draftId: string | null; draftAt: string | null; draftTranslatedFrom: { id: string; lang: string; at: string } | null };
export const GEN_PARTS = ["intro", "positions", "skills", "activity"] as const;
export type GenPart = typeof GEN_PARTS[number];
export type LiDraftRaw = {
  lang: string; baseVersionId: string | null; baseLang: string | null; positioning: string | null; applicationId: string | null; updatedAt: string;
  generated: Partial<Record<GenPart, string>>; errors: Partial<Record<GenPart, string>>;
  headlineVariants: Array<{ type: string; text: string }>; skills: Array<{ name: string; verified: boolean }>; positionSkills: Record<string, string[]>;
  featured: Array<{ title: string; kind: string; why: string | null; url: string | null }>;
  recRequests: Array<{ to: string; text: string }>;
  pillars: Array<{ title: string; why: string | null; ideas: string[] }>;
  groups: { criteria: string[]; searchTerms: string[] } | null;
  plan: Array<{ week: number; tasks: string[] }>;
  ndaHints: string[]; warnings: string[];
  translatedFrom?: { id: string; lang: string; at: string };
};
export type LiDraft = {
  id: string; lang: string; raw: LiDraftRaw; profile: LinkedInProfile; placeholders: number; result: LiResult;
  judge: { checkedAt: string; error: string | null; stale: boolean; extras: Extras } | null;
};
/** Suggestions from CV + Documents (backend/src/linkedin-sources.ts). */
export type LiSources = {
  cvLang: string | null; skillsKnown: boolean;
  skills: Array<{ name: string; group: string | null; source: string; inProfile: boolean; inDraft: boolean }>;
  certifications: Array<{ name: string; issuer: string | null; date: string | null; credentialId: string | null; sources: string[]; inProfile: boolean }>;
  languages: Array<{ name: string; level: string | null; linkedinLevel: string | null; source: string; inProfile: boolean }>;
  keywords: string[];
};
/** What is left to do on LinkedIn (backend/src/linkedin-checklist.ts). */
export type LiChecklistItem = {
  tip: string | null;
  key: string; section: "setup" | "transfer" | "basics" | "documents" | "network" | "plan"; kind: string; label: string | null;
  params: Record<string, string | number>; copy: string | null; auto: boolean; done: boolean; blocked: "placeholders" | null;
};
export type LiChecklist = { items: LiChecklistItem[]; done: number; total: number };
type CheckResponse = {
  result: LiResult | null; state: LiState; version: LiVersion | null; judge?: Judge | null; lang: string | null; langs: LiLangInfo[];
  draft: LiDraft | null; sources?: LiSources | null; checklist?: LiChecklist | null;
};
type Job = {
  id: string; kind: "check" | "import" | "positioning" | "generate" | "translate"; status: "running" | "done" | "error"; step: string; startedAt: string; finishedAt?: string;
  error?: string; versionId?: string; warnings?: string[]; changed?: boolean; lang?: string | null; parts?: string[]; done?: string[]; failed?: string[];
};
export type DraftPatch = { headline?: string | null; summary?: string | null; positions?: Array<{ id: string; title?: string | null; description?: string | null }>; skills?: string[] };
export const LI_LANGS = ["de", "en", "fr"] as const;

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
  // Profile language shown (LinkedIn keeps one profile per language). null = newest import's language.
  const [langPick, setLangPick] = useState<string | null>(() => readStored<string | null>("licheck-lang", null));
  const setLang = (l: string) => { setLangPick(l); writeStored("licheck-lang", l); };

  const load = useCallback(async () => {
    try {
      const r = await api.get<CheckResponse>("/api/linkedin/check", { params: { uiLang, ...(langPick ? { lang: langPick } : {}) } });
      setData(r.data); setLoadErr(null);
    } catch (e) { setLoadErr(errMsg(e, t("linkedinCheck.loadError"))); }
  }, [uiLang, t, langPick]);
  const lang = data?.lang ?? langPick;
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
      // The generator saves after every part → show each part as soon as it is there.
      if (!list.some(j => j.status === "running") || list.some(j => (j.kind === "generate" || j.kind === "translate") && j.status === "running")) load();
    }, 3000);
    return () => clearInterval(iv);
  }, [anyRunning, loadJobs, load]);

  const startJob = async (p: Promise<{ data: Job }>) => {
    setError(null);
    try { const r = await p; setJobs(js => [r.data, ...js.filter(j => j.id !== r.data.id)]); setNow(Date.now()); }
    catch (e) { setError(errMsg(e, t("linkedinCheck.actionError"))); }
  };
  /** Judge the newest import of the shown language, or a given version (the draft). */
  const runJudge = (versionId?: string) => startJob(api.post<Job>("/api/linkedin/check", { ai, uiLang, lang, versionId }));
  // importLang: the language the user says the profile is in; empty = detect from the text.
  const importPdf = (file: File, importLang = "") => {
    const fd = new FormData(); fd.append("file", file); fd.append("ai", JSON.stringify(ai)); if (importLang) fd.append("lang", importLang);
    return startJob(api.post<Job>("/api/linkedin/import/pdf", fd));
  };
  const importText = (text: string, importLang = "") => startJob(api.post<Job>("/api/linkedin/import/text", { text, ai, lang: importLang || undefined }));
  const importZip = async (file: File, importLang = "") => {
    setError(null); setBusyKey("zip");
    try {
      const fd = new FormData(); fd.append("file", file); if (importLang) fd.append("lang", importLang);
      const r = await api.post<{ lang: string | null }>("/api/linkedin/import/zip", fd);
      setLang(r.data.lang || "unknown");
    }
    catch (e) { setError(errMsg(e, t("linkedinCheck.actionError"))); }
    finally { setBusyKey(null); }
  };
  const setVersionLang = async (id: string, l: string) => {
    setBusyKey(`lang:${id}`);
    try { await api.patch(`/api/linkedin/versions/${id}`, { lang: l }); setLang(l); }
    catch (e) { setError(errMsg(e, t("linkedinCheck.actionError"))); }
    finally { setBusyKey(null); }
  };

  // Generator: positioning first, then the texts — both for the shown profile language.
  const runPositioning = (applicationId?: string | null) => startJob(api.post<Job>("/api/linkedin/positioning", { ai, lang, applicationId: applicationId || null }));
  const runGenerate = (parts: GenPart[], applicationId?: string | null) => startJob(api.post<Job>("/api/linkedin/generate", { ai, lang, parts, applicationId: applicationId || null }));
  /** Translate the shown draft into other profile languages (their drafts are created or replaced). */
  const runTranslate = (langs: string[]) => data?.draft && startJob(api.post<Job>(`/api/linkedin/drafts/${data.draft.id}/translate`, { ai, langs }));
  const patchDraft = async (patch: DraftPatch) => {
    const id = data?.draft?.id;
    if (!id) return;
    setBusyKey("draft");
    try { await api.patch(`/api/linkedin/drafts/${id}`, patch); await load(); }
    catch (e) { setError(errMsg(e, t("linkedinCheck.actionError"))); }
    finally { setBusyKey(null); }
  };
  const deleteDraft = async () => {
    const id = data?.draft?.id;
    if (!id) return;
    setBusyKey("draft");
    try { await api.delete(`/api/linkedin/drafts/${id}`); await load(); }
    catch (e) { setError(errMsg(e, t("linkedinCheck.actionError"))); }
    finally { setBusyKey(null); }
  };

  const patchState = async (patch: Record<string, unknown>, key: string) => {
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

  const setAnswers = (answers: Record<string, string>) => patchState({ answers }, "answers");
  const toggleChecklist = (key: string, done: boolean) => patchState({ checklistToggle: { key, done } }, `cl:${key}`);
  const choosePositioning = (chosen: string | null) => patchState({ positioning: { lang, chosen } }, "positioning");

  const judgeJob = jobs.find(j => j.kind === "check") ?? null;
  const importJob = jobs.find(j => j.kind === "import") ?? null;
  const positioningJob = jobs.find(j => j.kind === "positioning") ?? null;
  const generateJob = jobs.find(j => j.kind === "generate") ?? null;
  const translateJob = jobs.find(j => j.kind === "translate") ?? null;
  return {
    data, loadErr, error, busyKey, now, judgeJob, importJob, positioningJob, generateJob, translateJob, load,
    lang, setLang, langs: data?.langs ?? [], draft: data?.draft ?? null, sources: data?.sources ?? null, checklist: data?.checklist ?? null,
    toggleChecklist,
    judgeRunning: judgeJob?.status === "running", importRunning: importJob?.status === "running",
    positioningRunning: positioningJob?.status === "running", generateRunning: generateJob?.status === "running", translateRunning: translateJob?.status === "running",
    runJudge, importPdf, importText, importZip, setVersionLang, setSelf, setGoal, toggleWaiver,
    setAnswers, choosePositioning, runPositioning, runGenerate, runTranslate, patchDraft, deleteDraft,
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

export function CloudNote({ s }: { s: LiCheckState }) {
  const { t } = useTranslation();
  return s.cloud ? <div className="chk-note"><WarningTriangle width={11} height={11} style={{ verticalAlign: -1 }} /> {t("linkedinCheck.judge.cloud", { provider: s.cloud })}</div> : null;
}

function RunBar({ s, draft }: { s: LiCheckState; draft: boolean }) {
  const { t, i18n } = useTranslation();
  const judge = draft ? s.draft?.judge : s.data?.judge;
  const target = draft ? s.draft : s.data?.version;
  const job = s.judgeJob;
  const stale = draft && !!s.draft?.judge?.stale;
  return (
    <div className="chk-stack" style={{ gap: 8 }}>
      <div className="chk-run">
        <button className="btn btn-primary" style={{ fontSize: 12, gap: 6 }} disabled={!target || s.judgeRunning || !s.aiReady} onClick={() => s.runJudge(draft ? s.draft?.id : undefined)}>
          {s.judgeRunning ? <RefreshCircle width={12} height={12} className="chk-spin" /> : <Play width={12} height={12} />}
          {s.judgeRunning ? t("linkedinCheck.judge.running") : judge ? t("linkedinCheck.judge.rerun") : t("linkedinCheck.judge.run")}
        </button>
        {s.judgeRunning && job && <span className="chk-muted">{t(`linkedinCheck.judge.step.${job.step}`, job.step)} · {elapsedOf(job, s.now)}</span>}
        {!s.judgeRunning && judge && <span className="chk-muted">{t("linkedinCheck.judge.at", { date: new Date(judge.checkedAt).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }) })}</span>}
      </div>
      {!s.aiReady && <div className="chk-note" data-tone="info">{t("linkedinCheck.judge.noAi")}</div>}
      <CloudNote s={s} />
      {stale && !s.judgeRunning && <div className="chk-note" data-tone="info">{t("linkedinCheck.draft.judgeStale")}</div>}
      {!judge && target && !s.judgeRunning && <div className="chk-note" data-tone="info">{t("linkedinCheck.judge.needed")}</div>}
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

/** Bewertung: total (extrapolated) + disclaimer, steps, areas, details incl. self-report, AI visibility.
 *  `draft` = score the draft of the shown language instead of the imported profile. */
/** `extra` renders below the biggest levers (the page passes the "From your documents" card). */
export function ScoreTab({ s, focusGroup, draft = false, extra }: { s: LiCheckState; focusGroup: string | null; draft?: boolean; extra?: ReactNode }) {
  const { t } = useTranslation();
  const res = draft ? s.draft?.result : s.data?.result;
  const before = draft ? s.data?.result : null;
  const self = s.data?.state.selfReport ?? {};
  const focusRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focusGroup) focusRef.current?.scrollIntoView({ behavior: "auto", block: "start" }); }, [focusGroup]);
  if (!res) {
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
          {draft && <div className="li-compare">{before
            ? t("linkedinCheck.draft.compare", { before: before.total, after: res.total, delta: `${res.total - before.total >= 0 ? "+" : ""}${res.total - before.total}` })
            : t("linkedinCheck.draft.scoreNew")}</div>}
        </TotalScore>
        <div className="chk-note" data-tone="info"><InfoCircle width={11} height={11} style={{ verticalAlign: -1 }} /> {t("linkedinCheck.disclaimer")}</div>
        <RunBar s={s} draft={draft} />
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

      {extra}

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

export function withPlaceholders(text: string) {
  return text.split(/(\[X\])/g).map((p, i) => (p === "[X]" ? <mark key={i}>[X]</mark> : p));
}
export function CopyBtn({ text }: { text: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn btn-ghost btn-icon chk-icon-btn" title={t("check.copy")}
      onClick={async () => { await copyText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>
      {done ? <Check width={11} height={11} /> : <Copy width={11} height={11} />}
    </button>
  );
}

export const ANSWER_KEYS = ["strengths", "audience", "outcomes", "askedFor", "avoid"] as const;
/** Career starters answer about education and first practice instead of audience and outcomes. */
const BEGINNER_ANSWER_KEYS = ["strengths", "education", "practice", "askedFor", "avoid"] as const;
/** Answers that are keyword lists (stored as "a, b, c" — same field, so older free text still reads fine). */
const KEYWORD_ANSWERS: readonly string[] = ["strengths"];
const ANSWER_MAX = 800;   // linkedInStateSchema.answers
const splitKeywords = (v: string) => v.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);

/** Combo box for keywords: chips (× removes), typing with autocomplete (Enter / comma adds), suggestion chips (+ adds). */
function KeywordField({ id, value, suggestions, placeholder, onChange }: {
  id: string; value: string; suggestions: string[]; placeholder: string; onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const chips = splitKeywords(value);
  const has = (k: string) => chips.some(c => c.toLowerCase() === k.toLowerCase());
  const [input, setInput] = useState("");
  const [more, setMore] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rest = suggestions.filter(k => !has(k));
  const shown = more ? rest : rest.slice(0, 12);
  const set = (list: string[]) => { const v = list.join(", "); if (v.length <= ANSWER_MAX) onChange(v); };
  const add = (raw: string) => {
    const fresh = splitKeywords(raw).filter((k, i, a) => !has(k) && a.findIndex(x => x.toLowerCase() === k.toLowerCase()) === i);
    if (fresh.length) set([...chips, ...fresh]);
    setInput("");
  };
  return (
    <div className="li-kw">
      <div className="li-kw-box" onClick={e => { if (e.target === e.currentTarget) inputRef.current?.focus(); }}>
        {chips.map(c => (
          <span key={c} className="li-kw-chip">
            {c}
            <button type="button" aria-label={t("linkedinCheck.gen.kw.remove", { k: c })} title={t("linkedinCheck.gen.kw.remove", { k: c })}
              onClick={() => set(chips.filter(x => x !== c))}><Xmark width={10} height={10} /></button>
          </span>
        ))}
        <input ref={inputRef} id={id} list={`${id}-list`} value={input} placeholder={chips.length ? t("linkedinCheck.gen.kw.addPh") : placeholder}
          onChange={e => { const v = e.target.value; if (/[,;]$/.test(v)) add(v); else setInput(v); }}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); add(input); }
            else if (e.key === "Backspace" && !input && chips.length) set(chips.slice(0, -1));
          }}
          onBlur={() => input.trim() && add(input)} />
        <datalist id={`${id}-list`}>{rest.map(k => <option key={k} value={k} />)}</datalist>
      </div>
      {rest.length > 0 && (
        <div className="li-kw-sugg">
          <span className="lid-label">{t("linkedinCheck.gen.kw.suggestions")}</span>
          <div className="lic-chips">
            {shown.map(k => (
              <button key={k} type="button" className="li-kw-add" onClick={() => set([...chips, k])}><Plus width={10} height={10} />{k}</button>
            ))}
            {rest.length > 12 && (
              <button type="button" className="btn btn-ghost li-btn" onClick={() => setMore(m => !m)}>
                {more ? t("linkedinCheck.gen.kw.less") : t("linkedinCheck.gen.kw.more", { count: rest.length - 12 })}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
type AppLite = { id: string; company: string; role: string; archived?: string | null };

/** Which kind of draft the shown language gets: sharpen its import, write it from another language, or build from the CV. */
export function draftMode(s: LiCheckState): "sharpen" | "translate" | "build" {
  const info = s.langs.find(l => l.lang === s.lang);
  if (info?.importId) return "sharpen";
  return s.langs.some(l => l.importId && l.lang !== "unknown") ? "translate" : "build";
}

function GenStatus({ s }: { s: LiCheckState }) {
  const { t } = useTranslation();
  const job = s.generateJob?.lang === s.lang ? s.generateJob : null;
  const raw = s.draft?.raw;
  const parts = (job?.parts ?? (raw ? GEN_PARTS.filter(p => raw.generated[p] || raw.errors[p]) : [])) as GenPart[];
  if (!parts.length) return null;
  return (
    <ul className="li-genstatus">
      {parts.map(p => {
        const running = job?.status === "running" && job.step === p;
        const failed = job ? job.failed?.includes(p) : !!raw?.errors[p] && !raw.generated[p];
        const done = job ? job.done?.includes(p) : !!raw?.generated[p];
        return (
          <li key={p} data-state={running ? "running" : failed ? "failed" : done ? "done" : "waiting"}>
            {running ? <RefreshCircle width={11} height={11} className="chk-spin" /> : failed ? <WarningTriangle width={11} height={11} /> : done ? <Check width={11} height={11} /> : <Clock width={11} height={11} />}
            <span>{t(`linkedinCheck.gen.part.${p}`)}</span>
            {running && job && <span className="chk-muted">{elapsedOf(job, s.now)}</span>}
            {failed && raw?.errors[p] && <span className="chk-muted">{raw.errors[p]}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Draft warnings ("intro|phrases:…") → readable lines. */
function draftWarnings(raw: LiDraftRaw, t: (k: string, o?: Record<string, unknown>) => string) {
  return raw.warnings.map(w => {
    const body = w.includes("|") ? w.slice(w.indexOf("|") + 1) : w;
    const [kind, ...rest] = body.split(":");
    const v = rest.join(":");
    return kind === "unverified" ? t("linkedinCheck.gen.warn.unverified", { what: t(`linkedinCheck.gen.warn.what.${rest[0]}`, { defaultValue: rest[0] }), v: rest.slice(1).join(":") })
      : t(`linkedinCheck.gen.warn.${kind}`, { v, defaultValue: body });
  });
}

// Same heuristic as detectTextLang() in backend/src/linkedin-rules.ts: language of a longer text, else null.
const LANG_WORDS: Record<string, string[]> = {
  de: ["und", "der", "die", "das", "ich", "mit", "fur", "ist", "nicht", "eine", "auf", "von", "zu", "bei"],
  en: ["and", "the", "with", "for", "is", "my", "of", "to", "in", "at", "who", "that", "on"],
  fr: ["et", "le", "la", "les", "des", "pour", "avec", "est", "je", "une", "dans", "du", "sur"],
};
function textLang(text: string): string | null {
  const w = text.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/[^\p{L}]+/u);
  if (w.length < 12) return null;
  const best = Object.entries(LANG_WORDS).map(([l, list]) => [l, w.filter(x => list.includes(x)).length] as const).sort((a, b) => b[1] - a[1])[0];
  return best[1] >= 2 ? best[0] : null;
}

/** Step 4: prepare the drafts of the other profile languages by translating this draft, so the
 *  language switch shows them right away. A target with its own (not translated) draft is
 *  unchecked by default, since translating replaces it. */
function TranslateCard({ s, lang }: { s: LiCheckState; lang: string }) {
  const { t, i18n } = useTranslation();
  const others = LI_LANGS.filter(l => l !== lang);
  const infoOf = (l: string) => s.langs.find(x => x.lang === l);
  const ownDraft = (l: string) => { const i = infoOf(l); return !!i?.draftId && !i.draftTranslatedFrom; };
  const [sel, setSel] = useState<string[]>(() => others.filter(l => !ownDraft(l)));
  const job = s.translateJob?.lang === lang ? s.translateJob : null;
  const name = (l: string) => t(`linkedinCheck.lang.${l}`);
  const draftAt = s.draft ? Date.parse(s.draft.raw.updatedAt) : 0;
  return (
    <div className="chk-card chk-stack" style={{ gap: 10 }}>
      <div className="chk-h" style={{ margin: 0 }}><span className="li-stepno">4</span>{t("linkedinCheck.gen.translate.title")}</div>
      <div className="chk-muted">{t("linkedinCheck.gen.translate.hint", { lang: name(lang) })}</div>
      <div className="li-parts" style={{ flexDirection: "column", alignItems: "flex-start" }}>
        {others.map(l => {
          const i = infoOf(l);
          const tf = i?.draftTranslatedFrom;
          const status = !i?.draftId ? t("linkedinCheck.gen.translate.none")
            : tf ? (tf.lang === lang && Date.parse(tf.at) < draftAt ? t("linkedinCheck.gen.translate.stale", { lang: name(tf.lang) })
              : t("linkedinCheck.gen.translate.from", { lang: name(tf.lang), date: new Date(tf.at).toLocaleDateString(i18n.language) }))
            : t("linkedinCheck.gen.translate.own");
          return (
            <label key={l} className="li-check">
              <input type="checkbox" checked={sel.includes(l)} onChange={e => setSel(xs => e.target.checked ? [...xs, l] : xs.filter(x => x !== l))} />
              <span>{name(l)}</span>
              <span className="chk-muted">· {status}</span>
              {job?.done?.includes(l) && <Check width={10} height={10} className="li-gen-ok" />}
            </label>
          );
        })}
      </div>
      {sel.some(ownDraft) && <div className="chk-note" data-tone="warn">{t("linkedinCheck.gen.translate.replaceOwn", { langs: sel.filter(ownDraft).map(name).join(", ") })}</div>}
      <div className="li-actions">
        <button className="btn btn-primary li-btn" disabled={!s.aiReady || !sel.length || s.translateRunning || s.generateRunning} onClick={() => s.runTranslate(sel)}>
          {s.translateRunning ? <RefreshCircle width={11} height={11} className="chk-spin" /> : <Sparks width={11} height={11} />}
          {t("linkedinCheck.gen.translate.run")}
        </button>
        {s.translateRunning && job && <span className="chk-muted">{t("linkedinCheck.gen.translate.running", { lang: name(job.step) })} {elapsedOf(job, s.now)}</span>}
      </div>
      {job?.status === "done" && !s.translateRunning && <div className="chk-note" data-tone="info">{t("linkedinCheck.gen.translate.done", { langs: (job.done ?? []).map(name).join(", ") })}</div>}
      {job?.status === "error" && job.error && <div className="chk-note" data-tone="error">{job.error}</div>}
      {!!job?.failed?.length && job.status !== "running" && <div className="chk-note" data-tone="error">{t("linkedinCheck.gen.translate.failed", { langs: job.failed.map(name).join(", ") })}</div>}
    </div>
  );
}

/** KI-Werkzeuge: the text generator for the shown profile language (questions → positioning → texts)
 *  plus the headline variants of the judge run. */
export function ToolsTab({ s, onShowDraft, persona }: { s: LiCheckState; onShowDraft: () => void; persona?: string | null }) {
  const { t } = useTranslation();
  const beginner = persona === "berufseinsteiger";
  const answerKeys: readonly string[] = beginner ? BEGINNER_ANSWER_KEYS : ANSWER_KEYS;
  // askedFor / hints have a career-starter wording.
  const qKey = (k: string) => (beginner && k === "askedFor" ? "askedForBeginner" : k);
  const judge = s.data?.judge;
  const variants = judge?.extras.headlineVariants ?? [];
  const lang = s.lang && (LI_LANGS as readonly string[]).includes(s.lang) ? s.lang : null;
  const state = s.data?.state;
  const pos = lang ? state?.positioning?.[lang] : undefined;
  const mode = draftMode(s);
  const answersKey = JSON.stringify(state?.answers ?? {});
  const [answers, setAnswersLocal] = useState<Record<string, string>>(state?.answers ?? {});
  useEffect(() => { setAnswersLocal(JSON.parse(answersKey)); }, [answersKey]);
  const [chosen, setChosen] = useState(pos?.chosen ?? "");
  useEffect(() => { setChosen(pos?.chosen ?? ""); }, [pos?.chosen, lang]);
  const [parts, setParts] = useState<GenPart[]>([...GEN_PARTS]);
  const [appId, setAppId] = useState<string>(s.draft?.raw.applicationId ?? "");
  const [confirmDel, setConfirmDel] = useState(false);
  const { data: apps } = useQuery({ queryKey: ["applications"], queryFn: async () => (await api.get<AppLite[]>("/api/applications")).data });
  const posJob = s.positioningJob?.lang === lang ? s.positioningJob : null;
  const genJob = s.generateJob?.lang === lang ? s.generateJob : null;
  const draft = s.draft;
  const langName = lang ? t(`linkedinCheck.lang.${lang}`) : "";
  const baseLang = s.langs.find(l => l.importId && l.lang !== s.lang && l.lang !== "unknown")?.lang;
  // Positioning written in another language than the profile (older runs, or typed by hand):
  // it feeds every generated text, so the user should replace it.
  const posWrongLang = [chosen, ...(pos?.options.map(o => o.text) ?? [])].map(textLang).find(l => !!l && l !== lang) ?? null;

  if (!lang) {
    return <div className="chk-note" data-tone="info">{t("linkedinCheck.gen.unknownLang")}</div>;
  }
  return (
    <div className="chk-stack">
      <div className="chk-card chk-stack" style={{ gap: 6 }}>
        <div className="chk-h" style={{ margin: 0 }}>{t(`linkedinCheck.gen.title.${mode}`, { lang: langName })}</div>
        <div className="chk-muted">{t(`linkedinCheck.gen.intro.${mode}`, { lang: langName, base: baseLang ? t(`linkedinCheck.lang.${baseLang}`) : "" })}</div>
        {!s.aiReady && <div className="chk-note" data-tone="info">{t("linkedinCheck.judge.noAi")}</div>}
        <CloudNote s={s} />
      </div>

      <div className="chk-card chk-stack" style={{ gap: 10 }}>
        <div className="chk-h" style={{ margin: 0 }}><span className="li-stepno">1</span>{t("linkedinCheck.gen.questions")}</div>
        <div className="chk-muted">{t(beginner ? "linkedinCheck.gen.questionsHintBeginner" : mode === "build" ? "linkedinCheck.gen.questionsHintBuild" : "linkedinCheck.gen.questionsHint")}</div>
        {answerKeys.map(k => KEYWORD_ANSWERS.includes(k) ? (
          <div key={k} className="li-field">
            <label htmlFor={`li-q-${k}`}>{t(`linkedinCheck.gen.q.${qKey(k)}`)}</label>
            <KeywordField id={`li-q-${k}`} value={answers[k] ?? ""} suggestions={s.sources?.keywords ?? []} placeholder={t(`linkedinCheck.gen.qPh.${qKey(k)}`)}
              onChange={v => { setAnswersLocal(a => ({ ...a, [k]: v })); s.setAnswers({ [k]: v }); }} />
          </div>
        ) : (
          <label key={k} className="li-field">
            <span>{t(`linkedinCheck.gen.q.${qKey(k)}`)}</span>
            <textarea className="li-answer" rows={2} value={answers[k] ?? ""} placeholder={t(`linkedinCheck.gen.qPh.${qKey(k)}`)}
              onChange={e => setAnswersLocal(a => ({ ...a, [k]: e.target.value }))}
              onBlur={() => (answers[k] ?? "") !== (state?.answers?.[k] ?? "") && s.setAnswers({ [k]: answers[k] ?? "" })} />
          </label>
        ))}
      </div>

      <div className="chk-card chk-stack" style={{ gap: 10 }}>
        <div className="chk-h" style={{ margin: 0 }}><span className="li-stepno">2</span>{t("linkedinCheck.gen.positioning")}</div>
        <div className="chk-muted">{t("linkedinCheck.gen.positioningHint")}</div>
        <div className="li-actions">
          <button className="btn btn-secondary li-btn" disabled={!s.aiReady || s.positioningRunning} onClick={() => s.runPositioning(appId)}>
            {s.positioningRunning ? <RefreshCircle width={11} height={11} className="chk-spin" /> : <Sparks width={11} height={11} />}
            {pos?.options.length ? t("linkedinCheck.gen.positioningAgain") : t("linkedinCheck.gen.positioningRun")}
          </button>
          {s.positioningRunning && posJob && <span className="chk-muted">{elapsedOf(posJob, s.now)}</span>}
        </div>
        {posJob?.status === "error" && posJob.error && <div className="chk-note" data-tone="error">{posJob.error}</div>}
        {posWrongLang && <div className="chk-note" data-tone="warn">{t("linkedinCheck.gen.positioningWrongLang", { found: t(`linkedinCheck.lang.${posWrongLang}`), lang: langName })}</div>}
        {!!pos?.options.length && (
          <div className="li-options" role="radiogroup" aria-label={t("linkedinCheck.gen.positioning")}>
            {pos.options.map((o, i) => (
              <button key={i} type="button" role="radio" aria-checked={chosen === o.text} className="li-option" onClick={() => setChosen(o.text)}>
                {o.angle && <span className="li-kind" style={{ marginLeft: 0 }}>{o.angle}</span>}
                <span>{withPlaceholders(o.text)}</span>
              </button>
            ))}
          </div>
        )}
        <label className="li-field">
          <span>{t("linkedinCheck.gen.positioningOwn")}</span>
          <textarea className="li-answer" rows={2} value={chosen} placeholder={t("linkedinCheck.gen.positioningPh")} onChange={e => setChosen(e.target.value)} />
        </label>
        <div className="li-actions">
          <button className="btn btn-primary li-btn" disabled={!chosen.trim() || chosen.trim() === (pos?.chosen ?? "") || s.busyKey === "positioning"}
            onClick={() => s.choosePositioning(chosen.trim())}><Check width={11} height={11} /> {t("linkedinCheck.gen.confirm")}</button>
          {pos?.chosen && chosen.trim() === pos.chosen && <span className="li-confirmed"><Check width={11} height={11} /> {t("linkedinCheck.gen.confirmed")}</span>}
        </div>
      </div>

      <div className="chk-card chk-stack" style={{ gap: 10 }}>
        <div className="chk-h" style={{ margin: 0 }}><span className="li-stepno">3</span>{t("linkedinCheck.gen.texts")}</div>
        <div className="li-parts">
          {GEN_PARTS.map(p => (
            <label key={p} className="li-check">
              <input type="checkbox" checked={parts.includes(p)} onChange={e => setParts(ps => e.target.checked ? GEN_PARTS.filter(x => ps.includes(x) || x === p) : ps.filter(x => x !== p))} />
              <span>{t(`linkedinCheck.gen.part.${p}`)}</span>
              {draft?.raw.generated[p] && <Check width={10} height={10} className="li-gen-ok" />}
            </label>
          ))}
        </div>
        <label className="li-field">
          <span>{t("linkedinCheck.gen.tailor")}</span>
          <select className="input-line" value={appId} onChange={e => setAppId(e.target.value)}>
            <option value="">{t("linkedinCheck.gen.tailorNone")}</option>
            {(apps ?? []).filter(a => a.archived !== "true").map(a => <option key={a.id} value={a.id}>{a.company} · {a.role}</option>)}
          </select>
        </label>
        <div className="li-actions">
          <button className="btn btn-primary li-btn" disabled={!s.aiReady || !pos?.chosen || !parts.length || s.generateRunning} onClick={() => s.runGenerate(parts, appId)}>
            {s.generateRunning ? <RefreshCircle width={11} height={11} className="chk-spin" /> : <Play width={11} height={11} />}
            {draft ? t("linkedinCheck.gen.regenerate") : t("linkedinCheck.gen.generate")}
          </button>
          {!pos?.chosen && <span className="chk-muted">{t("linkedinCheck.gen.needPositioning")}</span>}
        </div>
        {s.generateRunning && <div className="chk-note" data-tone="info">{t("linkedinCheck.gen.slow")}</div>}
        <GenStatus s={s} />
        {genJob?.status === "error" && genJob.error && <div className="chk-note" data-tone="error">{genJob.error}</div>}
        <div className="li-privacy"><InfoCircle width={11} height={11} /> {t("linkedinCheck.gen.rules")}</div>
      </div>

      {draft && <TranslateCard s={s} lang={lang} />}

      {draft && (
        <div className="chk-card chk-stack" style={{ gap: 8 }}>
          <div className="chk-h" style={{ margin: 0 }}>{t("linkedinCheck.draft.title", { lang: langName })}</div>
          <div className="li-actions">
            <button className="btn btn-primary li-btn" onClick={onShowDraft}><Page width={11} height={11} /> {t("linkedinCheck.draft.show")}</button>
            {!confirmDel
              ? <button className="btn btn-ghost li-btn" onClick={() => setConfirmDel(true)}>{t("linkedinCheck.draft.delete")}</button>
              : <><button className="btn btn-secondary li-btn" disabled={s.busyKey === "draft"} onClick={async () => { await s.deleteDraft(); setConfirmDel(false); }}>{t("linkedinCheck.draft.deleteConfirm")}</button>
                <button className="btn btn-ghost li-btn" onClick={() => setConfirmDel(false)}>{t("linkedinCheck.draft.cancel")}</button></>}
          </div>
          {draft.placeholders > 0 && <div className="chk-note">{t("linkedinCheck.draft.placeholders", { count: draft.placeholders })}</div>}
          {draft.raw.ndaHints.length > 0 && <div className="chk-note"><WarningTriangle width={11} height={11} style={{ verticalAlign: -1 }} /> {t("linkedinCheck.tools.nda", { names: draft.raw.ndaHints.join(", ") })}</div>}
          {draft.raw.warnings.length > 0 && <ul className="chk-findings">{draftWarnings(draft.raw, t).map((w, i) => <li key={i}>{w}</li>)}</ul>}
        </div>
      )}

      <div className="chk-card">
        <div className="chk-h">{t("linkedinCheck.tools.headlines")}</div>
        {!judge ? <div className="chk-muted">{t("linkedinCheck.tools.needJudge")}</div>
          : !variants.length ? <div className="chk-muted">{t("linkedinCheck.tools.noVariants")}</div>
          : (
            <div className="chk-stack" style={{ gap: 8 }}>
              <div className="chk-muted">{t("linkedinCheck.tools.placeholderHint")}</div>
              {variants.map((v, i) => (
                <div key={i} className="chk-rewrite">
                  <div className="chk-rewrite-label"><span>{t(`linkedinCheck.tools.variant.${v.type}`, v.type)} · {v.text.length} / 160–220</span><CopyBtn text={v.text} /></div>
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
  const [importLang, setImportLang] = useState("");   // "" = detect from the profile text
  const ver = s.data?.version;
  useEffect(() => { setRole(goal.targetRole ?? ""); setMarket(goal.market ?? ""); }, [goal.targetRole, goal.market]);
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
          <div className="chk-stack" style={{ gap: 6 }}>
            <div className="chk-muted" style={{ color: "var(--fg-2)" }}>
              <b>{t(`linkedinCheck.source.kind.${ver.source}`, ver.source)}</b> · {fmt(ver.createdAt)}{ver.note && <> · {ver.note}</>}
            </div>
            <label className="li-inline">
              <span>{t("linkedinCheck.lang.profileLang")}</span>
              <select className="input-line" value={ver.lang ?? ""} disabled={s.busyKey === `lang:${ver.id}`} onChange={e => e.target.value && s.setVersionLang(ver.id, e.target.value)}>
                {!ver.lang && <option value="">{t("linkedinCheck.lang.unknown")}</option>}
                {LI_LANGS.map(l => <option key={l} value={l}>{t(`linkedinCheck.lang.${l}`)}</option>)}
              </select>
            </label>
            {!ver.lang && <div className="chk-note">{t("linkedinCheck.lang.setHint")}</div>}
          </div>
        ) : <div className="chk-muted">{t("linkedinCheck.noProfile")}</div>}
        <div className="li-inline">
          <span>{t("linkedinCheck.lang.importAs")}</span>
          <div className="li-self" role="radiogroup" aria-label={t("linkedinCheck.lang.importAs")}>
            {["", ...LI_LANGS].map(l => (
              <button key={l || "auto"} type="button" role="radio" aria-checked={importLang === l} className="li-self-opt" onClick={() => setImportLang(l)}>
                {l ? t(`linkedinCheck.lang.${l}`) : t("linkedinCheck.lang.auto")}
              </button>
            ))}
          </div>
        </div>
        <div className="li-actions">
          <Link to="/profile" className="btn btn-secondary li-btn" style={{ textDecoration: "none" }}><LinkIcon width={11} height={11} /> {t("linkedinCheck.source.connection")}</Link>
          {filePick(".zip,application/zip", f => s.importZip(f, importLang), <>{s.busyKey === "zip" ? <RefreshCircle width={11} height={11} className="chk-spin" /> : <Upload width={11} height={11} />} {t("linkedinCheck.source.zip")}</>, s.busyKey === "zip")}
          {filePick("application/pdf,.pdf", f => s.importPdf(f, importLang), <><Page width={11} height={11} /> {t("linkedinCheck.source.pdf")}</>, s.importRunning || !s.aiReady)}
          <button type="button" className="btn btn-ghost li-btn" disabled={s.importRunning || !s.aiReady} onClick={() => setShowPaste(v => !v)}>
            <PasteClipboard width={11} height={11} /> {t("linkedinCheck.source.text")}
          </button>
        </div>
        {showPaste && (
          <div className="chk-stack" style={{ gap: 6 }}>
            <textarea className="li-token" rows={6} value={paste} placeholder={t("linkedinCheck.source.textPh")} onChange={e => setPaste(e.target.value)} />
            <button type="button" className="btn btn-primary li-btn" style={{ alignSelf: "flex-start" }} disabled={paste.trim().length < 80 || s.importRunning}
              onClick={async () => { await s.importText(paste, importLang); setPaste(""); setShowPaste(false); }}>{t("linkedinCheck.source.textGo")}</button>
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
    </div>
  );
}

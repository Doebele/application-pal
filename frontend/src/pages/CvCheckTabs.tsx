// CV-Check: "Bewertung" and "Verbesserungen" sidebar tabs + the data hook behind them.
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Play, RefreshCircle } from "iconoir-react";
import type { CvLanguage } from "@application-pal/shared";
import { api } from "../lib/api";
import { useUiStore } from "../lib/store";
import {
  TotalScore, AreaBars, StepList, CheckGroup, CheckRow, BulletCard, RecommendationList,
} from "../components/check/CheckComponents";
import type { CheckResult } from "../components/check/types";
import type { PdfHighlight } from "../components/check/PdfViewer";

type CheckJob = { id: string; lang: CvLanguage; status: "running" | "done" | "error"; step: "pdf" | "llm" | "score"; startedAt: string; finishedAt?: string; error?: string };
type CheckResponse = { result: CheckResult | null; versionId: string | null; stale: boolean; inputErrors?: { layout: string | null; llm: string | null } };

const errMsg = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

/** Latest check for one language, the running job (polled) and waiver toggling. */
export function useCvCheck(lang: CvLanguage, versionId?: string | null) {
  const { i18n, t } = useTranslation();
  const { ai } = useUiStore();
  const uiLang = (["de", "en", "fr"].includes(i18n.language) ? i18n.language : "de");
  const [data, setData] = useState<CheckResponse | null>(null);
  const [job, setJob] = useState<CheckJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    const r = await api.get<CheckResponse>("/api/cv/check", { params: { lang, uiLang } }).catch(() => null);
    if (r) setData(r.data);
  }, [lang, uiLang]);
  const loadJob = useCallback(async () => {
    const r = await api.get<CheckJob[]>("/api/cv/check-jobs").catch(() => null);
    const j = r?.data.find(x => x.lang === lang) ?? null;
    setJob(j);
    return j;
  }, [lang]);
  // versionId: a finished (re-)import creates a new version — reload its check data,
  // otherwise score and PDF highlights keep describing the old text.
  useEffect(() => { setData(null); load(); loadJob(); }, [load, loadJob, versionId]);

  const running = job?.status === "running";
  useEffect(() => {
    if (!running) return;
    const iv = setInterval(async () => {
      setNow(Date.now());
      const j = await loadJob();
      if (j?.status !== "running") load();
    }, 3000);
    return () => clearInterval(iv);
  }, [running, loadJob, load]);

  const run = async () => {
    setError(null);
    try {
      const r = await api.post<CheckJob>("/api/cv/check", { lang, ai, uiLang });
      setJob(r.data); setNow(Date.now());
    } catch (e) { setError(errMsg(e, t("cvCheck.importError"))); }
  };

  const toggleWaiver = async (key: string, accepted: boolean) => {
    setBusyKey(key);
    try { await api.post("/api/cv/check/waivers", { lang, key, accepted }); await load(); }
    catch (e) { setError(errMsg(e, t("cvCheck.loadError"))); }
    finally { setBusyKey(null); }
  };

  return { data, job, running, error, busyKey, now, run, toggleWaiver, aiReady: ai.provider !== "none" };
}
export type CvCheckState = ReturnType<typeof useCvCheck>;

function RunBar({ s, hasVersion, fmt }: { s: CvCheckState; hasVersion: boolean; fmt: (iso: string | null) => string }) {
  const { t } = useTranslation();
  const res = s.data?.result;
  const elapsed = s.job && s.running ? Math.max(0, Math.round((s.now - Date.parse(s.job.startedAt)) / 1000)) : 0;
  return (
    <div className="chk-stack" style={{ gap: 8 }}>
      <div className="chk-run">
        <button className="btn btn-primary" style={{ fontSize: 12, gap: 6 }} disabled={!hasVersion || s.running} onClick={s.run}>
          {s.running ? <RefreshCircle width={12} height={12} style={{ animation: "spin 1s linear infinite" }} /> : <Play width={12} height={12} />}
          {s.running ? t("cvCheck.check.running") : res ? t("cvCheck.check.rerun") : t("cvCheck.check.run")}
        </button>
        {s.running && s.job && <span className="chk-muted">{t(`cvCheck.check.step.${s.job.step}`)} · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span>}
        {!s.running && res && <span className="chk-muted">{t("cvCheck.check.checkedAt", { date: fmt(res.checkedAt) })}</span>}
      </div>
      {!hasVersion && <div className="chk-note" data-tone="info">{t("cvCheck.check.needImport")}</div>}
      {s.running && <div className="chk-note" data-tone="info">{t("cvCheck.check.slowHint")}</div>}
      {s.error && <div className="chk-note" data-tone="error">{s.error}</div>}
      {s.job?.status === "error" && s.job.error && <div className="chk-note" data-tone="error">{s.job.error}</div>}
      {s.data?.stale && <div className="chk-note">{t("cvCheck.check.stale")}</div>}
      {s.data?.inputErrors?.layout && <div className="chk-note">{t("cvCheck.check.layoutError", { error: s.data.inputErrors.layout })}</div>}
      {s.data?.inputErrors?.llm && <div className="chk-note">{t("cvCheck.check.llmError", { error: s.data.inputErrors.llm })}</div>}
    </div>
  );
}

const AREAS = ["impact", "presentation", "competencies"] as const;
const GROUPS: Record<(typeof AREAS)[number], string[]> = {
  impact: ["action", "specifics", "language"],
  presentation: ["pages", "sections", "format", "section"],
  competencies: ["competency"],
};

export function ScoreTab({ s, hasVersion, fmt }: { s: CvCheckState; hasVersion: boolean; fmt: (iso: string | null) => string }) {
  const { t } = useTranslation();
  const res = s.data?.result;
  return (
    <div className="chk-stack">
      <div className="chk-card chk-stack" style={{ gap: 12 }}>
        {res ? (
          <TotalScore total={res.total} rawTotal={res.rawTotal} acceptedGain={res.acceptedGain}>
            <div className="chk-muted">
              {t("cvCheck.check.bonus", { points: res.bonus.points, state: res.bonus.earned ? t("cvCheck.check.bonusEarned") : t("cvCheck.check.bonusOpen") })}
              {res.accepted.length > 0 && <> · {t("cvCheck.check.acceptedInfo", { count: res.accepted.length })}</>}
            </div>
          </TotalScore>
        ) : hasVersion && !s.running ? <div className="chk-muted">{t("cvCheck.check.notChecked")}</div> : null}
        <RunBar s={s} hasVersion={hasVersion} fmt={fmt} />
      </div>

      {res && <>
        <div className="chk-card">
          <div className="chk-h">{t("cvCheck.check.steps")}</div>
          <StepList steps={res.steps} />
        </div>
        <div className="chk-card">
          <div className="chk-h">{t("cvCheck.check.areas")}</div>
          <AreaBars areas={AREAS.map(a => ({ id: a, label: t(`cvCheck.check.area.${a}`), ...res.areas[a] }))} />
        </div>
        <div className="chk-card">
          <div className="chk-h">{t("cvCheck.check.details")}</div>
          {AREAS.map(a => (
            <div key={a}>
              {GROUPS[a].map(g => (
                <CheckGroup key={g} title={`${t(`cvCheck.check.area.${a}`)} · ${t(`cvCheck.check.group.${g}`)}`}
                  checks={res.checks.filter(c => c.area === a && c.group === g)} onAccept={s.toggleWaiver} busyKey={s.busyKey} />
              ))}
            </div>
          ))}
        </div>
        <div className="chk-card">
          <div className="chk-h">{t("cvCheck.check.recommendations")}</div>
          <RecommendationList items={res.recommendations} />
        </div>
      </>}
    </div>
  );
}

export const isBulletDone = (b: CheckResult["bullets"][number]) => b.action.ok && (!!b.scope || !!b.outcome || b.specificsAccepted);

/** Highlights for the PDF viewer: bullets with open points (red) or accepted ones (accent), plus language findings. */
export function cvHighlights(res: CheckResult | null | undefined): PdfHighlight[] {
  if (!res) return [];
  const out: PdfHighlight[] = res.bullets
    .filter(b => !isBulletDone(b) || b.action.accepted || b.specificsAccepted)
    .map(b => ({ id: b.id, text: b.text, tone: isBulletDone(b) ? "accepted" : "fail", title: b.issues.join(" · ") || b.text }));
  for (const c of res.checks) {
    if (c.group !== "language" || c.status === "pass") continue;
    c.findings.forEach((f, i) => { if (f.where) out.push({ id: `${c.id}:${i}`, text: f.where, tone: c.status === "accepted" ? "accepted" : "info", title: `${c.label}: ${f.text}` }); });
  }
  return out;
}

export function ImproveTab({ s, hasVersion, fmt, activeId, onSelect }: {
  s: CvCheckState; hasVersion: boolean; fmt: (iso: string | null) => string; activeId?: string | null; onSelect?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [showDone, setShowDone] = useState(false);
  const res = s.data?.result;
  if (!res) return <div className="chk-card"><RunBar s={s} hasVersion={hasVersion} fmt={fmt} /></div>;
  const open = res.bullets.filter(b => !isBulletDone(b));
  const shown = showDone ? res.bullets : res.bullets.filter(b => !isBulletDone(b) || b.id === activeId);
  const lang = res.checks.filter(c => c.group === "language" && c.status !== "pass");
  return (
    <div className="chk-stack">
      <div className="chk-card">
        <div className="chk-h">{t("cvCheck.check.steps")}</div>
        <StepList steps={res.steps} />
      </div>

      <div>
        <div className="chk-run" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <div className="chk-h" style={{ margin: 0 }}>{t("cvCheck.check.bulletsOpen", { count: open.length })}</div>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setShowDone(v => !v)}>
            {showDone ? t("cvCheck.check.hideDone") : t("cvCheck.check.showDone")}
          </button>
        </div>
        <div className="chk-muted" style={{ marginBottom: 8 }}>{res.inputs.llm ? t("cvCheck.check.placeholderHint") : t("cvCheck.check.noRewrites")}</div>
        <div className="chk-stack" style={{ gap: 8 }}>
          {shown.map(b => <BulletCard key={b.id} bullet={b} onAccept={s.toggleWaiver} busyKey={s.busyKey} active={activeId === b.id} onSelect={onSelect} />)}
        </div>
      </div>

      {lang.length > 0 && (
        <div className="chk-card">
          <div className="chk-h">{t("cvCheck.check.languageIssues")}</div>
          {lang.map(c => <CheckRow key={c.id} check={c} onAccept={s.toggleWaiver} busy={s.busyKey === c.id} defaultOpen />)}
        </div>
      )}

      <div className="chk-card">
        <div className="chk-h">{t("cvCheck.check.competencyEvidence")}</div>
        {res.competencies.map(c => (
          <div key={c.id} className="chk-row">
            <div className="chk-area-head"><span>{c.label}</span><span className="chk-area-score">{c.score} / {c.max}</span></div>
            {c.evidence.length
              ? <ul className="chk-findings">{c.evidence.map((q, i) => <li key={i}>„{q}“</li>)}</ul>
              : <div className="chk-muted">{t("cvCheck.check.noEvidence")}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

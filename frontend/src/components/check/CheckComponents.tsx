// Shared, presentation-only building blocks for score-based checks (CV-Check now,
// LinkedIn-Check next). Styling lives in check.css (tokens + classes, no inline
// colours) so each component maps to a Figma component with variants.
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle, XmarkCircle, HelpCircle, NavArrowDown, NavArrowRight, ThumbsUp, Copy, Check } from "iconoir-react";
import type { AreaStatus, BulletOutcome, CheckOutcome, CheckStatus, ImproveStep, Recommendation } from "./types";
import "./check.css";

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && document.hasFocus()) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* fall through */ }
  }
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
  document.body.appendChild(el);
  el.focus(); el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
}

export function StatusPill({ status }: { status: CheckStatus | AreaStatus }) {
  const { t } = useTranslation();
  return <span className="chk-pill" data-status={status}>{t(`check.status.${status}`)}</span>;
}

export function StatusIcon({ status }: { status: CheckStatus }) {
  const p = { width: 14, height: 14, className: `chk-icon-${status}`, "aria-hidden": true } as const;
  if (status === "pass") return <CheckCircle {...p} />;
  if (status === "accepted") return <ThumbsUp {...p} />;
  if (status === "fail") return <XmarkCircle {...p} />;
  return <HelpCircle {...p} />;
}

export function TotalScore({ total, rawTotal, acceptedGain, max = 100, target = 80, children }: {
  total: number; rawTotal: number; acceptedGain: number; max?: number; target?: number; children?: ReactNode;
}) {
  const { t } = useTranslation();
  const tone = total >= target ? "high" : total >= max / 2 ? "mid" : "low";
  return (
    <div className="chk-total">
      <div className="chk-ring" data-tone={tone} style={{ ["--p" as string]: Math.round((total / max) * 100) }}
        role="img" aria-label={t("check.totalAria", { total, max })}>
        <div className="chk-ring-inner"><div><div className="chk-ring-num">{total}</div><div className="chk-ring-max">/ {max}</div></div></div>
      </div>
      <div className="chk-total-meta">
        {acceptedGain > 0
          ? <div className="chk-total-split">{t("check.split", { raw: rawTotal })} <b>+ {acceptedGain} {t("check.acceptedShort")}</b></div>
          : null}
        <div className="chk-muted">{t("check.target", { target })}</div>
        {children}
      </div>
    </div>
  );
}

export function AreaBars({ areas }: { areas: Array<{ id: string; label: string; score: number; max: number; status: AreaStatus }> }) {
  return (
    <div className="chk-areas">
      {areas.map(a => (
        <div key={a.id}>
          <div className="chk-area-head">
            <span>{a.label} <StatusPill status={a.status} /></span>
            <span className="chk-area-score">{Math.round(a.score)} / {a.max}</span>
          </div>
          <div className="chk-bar" data-status={a.status}><span style={{ width: `${Math.min(100, (a.score / a.max) * 100)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export function StepList({ steps }: { steps: ImproveStep[] }) {
  const { t } = useTranslation();
  if (!steps.length) return <div className="chk-muted">{t("check.noSteps")}</div>;
  return (
    <ol className="chk-steps">
      {steps.map(s => (
        <li key={s.id} className="chk-step">
          <span className="chk-step-gain">+{s.gain}</span>
          <span>{s.label}{s.detail && <span className="chk-step-detail">{s.detail}</span>}</span>
        </li>
      ))}
    </ol>
  );
}

export function AcceptToggle({ accepted, onToggle, busy, label }: { accepted: boolean; onToggle: (v: boolean) => void; busy?: boolean; label?: string }) {
  const { t } = useTranslation();
  return (
    <button type="button" className="chk-accept" aria-pressed={accepted} disabled={busy} onClick={() => onToggle(!accepted)}
      title={accepted ? t("check.unacceptHint") : t("check.acceptHint")}>
      <ThumbsUp width={11} height={11} /> {accepted ? t("check.accepted") : label ?? t("check.accept")}
    </button>
  );
}

/** One check with expandable rule + findings. Failing (or accepted) checks can be waived. */
export function CheckRow({ check, onAccept, busy, defaultOpen }: { check: CheckOutcome; onAccept?: (key: string, v: boolean) => void; busy?: boolean; defaultOpen?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(!!defaultOpen);
  const canWaive = !!onAccept && (check.status === "fail" || check.status === "accepted");
  return (
    <div className="chk-row">
      <button type="button" className="chk-row-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        {open ? <NavArrowDown width={11} height={11} /> : <NavArrowRight width={11} height={11} />}
        <StatusIcon status={check.status} />
        <span className="chk-row-label">{check.label}{check.hygiene && <span className="chk-muted"> · {t("check.hygiene")}</span>}</span>
        {check.max > 0 && <span className="chk-row-pts">{check.score} / {check.max}</span>}
      </button>
      {open && (
        <div className="chk-row-body">
          <div className="chk-rule">{check.rule}</div>
          {check.findings.length > 0 && (
            <ul className="chk-findings">
              {check.findings.map((f, i) => <li key={i}>{f.text}{f.where && <em>{f.where}</em>}</li>)}
            </ul>
          )}
          {canWaive && <AcceptToggle accepted={check.status === "accepted"} busy={busy} onToggle={v => onAccept!(check.id, v)} />}
        </div>
      )}
    </div>
  );
}

export function CheckGroup({ title, checks, onAccept, busyKey }: { title: string; checks: CheckOutcome[]; onAccept?: (key: string, v: boolean) => void; busyKey?: string | null }) {
  if (!checks.length) return null;
  return (
    <div>
      <div className="chk-group-title">{title}</div>
      {checks.map(c => <CheckRow key={c.id} check={c} onAccept={onAccept} busy={busyKey === c.id} />)}
    </div>
  );
}

/** Renders [X] placeholders highlighted so it is obvious a number is still missing. */
function withPlaceholders(text: string) {
  return text.split(/(\[X\])/g).map((p, i) => (p === "[X]" ? <mark key={i}>[X]</mark> : p));
}

function Rewrite({ label, text }: { label: string; text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="chk-rewrite">
      <div className="chk-rewrite-label">
        <span>{label}</span>
        <button type="button" className="btn btn-ghost btn-icon" style={{ padding: 2 }} title={t("check.copy")}
          onClick={async () => { await copyText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? <Check width={11} height={11} /> : <Copy width={11} height={11} />}
        </button>
      </div>
      <div className="chk-rewrite-text">{withPlaceholders(text)}</div>
    </div>
  );
}

/** A bullet with its issues, two rewrites (scope / outcome) and per-criterion waivers. */
export function BulletCard({ bullet, onAccept, busyKey }: { bullet: BulletOutcome; onAccept?: (key: string, v: boolean) => void; busyKey?: string | null }) {
  const { t } = useTranslation();
  const actionKey = `action:${bullet.id}`, specKey = `specifics:${bullet.id}`;
  const actionFail = !bullet.action.ok || bullet.action.accepted;
  const specFail = (!bullet.scope && !bullet.outcome) || bullet.specificsAccepted;
  const done = bullet.action.ok && (!!bullet.scope || !!bullet.outcome || bullet.specificsAccepted); // action.ok includes accepted
  return (
    <div className="chk-bullet" data-done={done}>
      {bullet.position && <div className="chk-bullet-pos">{bullet.position}</div>}
      <div className="chk-bullet-text">{bullet.text}</div>
      <div className="chk-tags">
        <span className="chk-pill" data-status={bullet.action.accepted ? "accepted" : bullet.action.ok ? "pass" : "fail"}>{t("check.bullet.action")}</span>
        <span className="chk-pill" data-status={bullet.scope ? "pass" : bullet.specificsAccepted ? "accepted" : "fail"}>{t("check.bullet.scope")}</span>
        <span className="chk-pill" data-status={bullet.outcome ? "pass" : bullet.specificsAccepted ? "accepted" : "fail"}>{t("check.bullet.outcome")}</span>
      </div>
      {bullet.issues.length > 0 && <ul className="chk-findings">{bullet.issues.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      {bullet.suggestions.scope && <Rewrite label={t("check.bullet.rewriteScope")} text={bullet.suggestions.scope} />}
      {bullet.suggestions.outcome && <Rewrite label={t("check.bullet.rewriteOutcome")} text={bullet.suggestions.outcome} />}
      {onAccept && (actionFail || specFail) && (
        <div className="chk-actions">
          {actionFail && <AcceptToggle accepted={bullet.action.accepted} busy={busyKey === actionKey} label={t("check.bullet.acceptAction")} onToggle={v => onAccept(actionKey, v)} />}
          {specFail && <AcceptToggle accepted={bullet.specificsAccepted} busy={busyKey === specKey} label={t("check.bullet.acceptSpecifics")} onToggle={v => onAccept(specKey, v)} />}
        </div>
      )}
    </div>
  );
}

export function RecommendationList({ items }: { items: Recommendation[] }) {
  return (
    <ul className="chk-recs">
      {items.map(r => (
        <li key={r.id} className="chk-rec"><StatusIcon status={r.ok ? "pass" : "fail"} /><span>{r.text}</span></li>
      ))}
    </ul>
  );
}

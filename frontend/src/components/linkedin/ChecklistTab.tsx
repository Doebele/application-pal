// Checklist tab: what is left to do on LinkedIn for the shown profile language — transfer the
// draft, self-report points, certificates/languages from the user's documents, recommendation
// requests and the 4-week plan (backend/src/linkedin-checklist.ts). Items an import can prove
// tick themselves after a re-import; self-report items set the self-report, so the score follows.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, RefreshCircle, InfoCircle } from "iconoir-react";
import { readStored, writeStored } from "../check/CheckLayout";
import { CopyBtn, type LiCheckState, type LiChecklistItem } from "../../pages/LinkedInCheckTabs";
import { fmtYm } from "./SourceSuggestions";
import "./linkedin.css";

const SECTIONS = ["setup", "transfer", "basics", "documents", "network", "plan"] as const;

function ItemRow({ item, s }: { item: LiChecklistItem; s: LiCheckState }) {
  const { t, i18n } = useTranslation();
  const p = item.params;
  const isSelf = item.kind === "self";
  const busy = s.busyKey === `cl:${item.key}` || (isSelf && s.busyKey === p.checkId);
  // Self-report items write the self-report (full points / cleared); auto items of other kinds are proven by an import.
  const locked = !!item.blocked || (item.auto && !isSelf);
  const toggle = () => {
    if (locked || busy) return;
    if (isSelf) s.setSelf(String(p.checkId), item.done ? null : Number(p.max));
    else s.toggleChecklist(item.key, !item.done);
  };
  const isSetup = item.kind === "setup";
  const label = item.label ?? (isSetup ? t(`linkedinCheck.checklist.setup.${p.id}.title`) : t(`linkedinCheck.checklist.kind.${item.kind}`, { ...p }));
  // How-to: set-up steps from the UI texts, self-report items from their checkpoint rule.
  const tip = isSetup ? t(`linkedinCheck.checklist.setup.${p.id}.tip`) : item.tip;
  const meta = item.kind === "cert"
    ? [p.issuer && t("linkedinCheck.sources.issuer", { v: p.issuer }), p.date && t("linkedinCheck.sources.issued", { v: fmtYm(String(p.date), i18n.language) }),
      p.credentialId && t("linkedinCheck.sources.credentialId", { v: p.credentialId })].filter(Boolean).join(" · ")
    : item.kind === "language" && p.level ? t(`linkedinCheck.sources.level.${p.level}`) : null;
  return (
    <li className="li-cl-item" data-done={item.done} data-blocked={!!item.blocked}>
      <button type="button" role="checkbox" aria-checked={item.done} aria-disabled={locked} className="li-cl-box" disabled={busy}
        title={item.blocked ? t("linkedinCheck.checklist.blocked") : item.auto && !isSelf ? t("linkedinCheck.checklist.autoHint") : undefined}
        onClick={toggle}>
        {busy ? <RefreshCircle width={11} height={11} className="chk-spin" /> : item.done ? <Check width={11} height={11} /> : null}
      </button>
      <div className="li-cl-body">
        <span className="li-cl-label">{label}</span>
        {meta && <span className="li-src-meta">{meta}</span>}
        {tip && (
          <details className="li-cl-tip">
            <summary>{t("linkedinCheck.checklist.how")}</summary>
            <div>{tip}</div>
          </details>
        )}
        {(item.auto || item.blocked) && (
          <span className="li-cl-tags">
            {item.auto && <span className="li-kind" data-tone="ok">{t(isSelf ? "linkedinCheck.checklist.reported" : "linkedinCheck.checklist.detected")}</span>}
            {item.blocked && <span className="lid-x">{t("linkedinCheck.checklist.fillX")}</span>}
          </span>
        )}
      </div>
      {item.copy && <CopyBtn text={item.copy} />}
    </li>
  );
}

export function ChecklistTab({ s, onOpenSource, onShowDraft }: { s: LiCheckState; onOpenSource: () => void; onShowDraft: () => void }) {
  const { t } = useTranslation();
  const [hideDone, setHideDoneState] = useState(() => readStored("licheck-cl-hidedone", false));
  const setHideDone = (v: boolean) => { setHideDoneState(v); writeStored("licheck-cl-hidedone", v); };
  const cl = s.checklist;
  if (!cl || !cl.total) {
    return <div className="chk-card"><div className="chk-muted">{t("linkedinCheck.checklist.empty")}</div></div>;
  }
  const pct = Math.round((cl.done / cl.total) * 100);
  const hasTransfer = cl.items.some(i => i.section === "transfer");
  return (
    <div className="chk-stack">
      <div className="chk-card chk-stack" style={{ gap: 8 }}>
        <div className="chk-h" style={{ margin: 0, justifyContent: "space-between" }}>
          <span>{t("linkedinCheck.checklist.title")}</span>
          <span className="chk-area-score">{t("linkedinCheck.checklist.progress", { done: cl.done, total: cl.total })}</span>
        </div>
        <div className="li-cl-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct}%` }} /></div>
        <div className="chk-muted"><InfoCircle width={11} height={11} style={{ verticalAlign: -1 }} /> {t("linkedinCheck.checklist.hint")}</div>
        <div className="li-actions">
          <button type="button" className="btn btn-secondary li-btn" onClick={onOpenSource}>{t("linkedinCheck.checklist.reimport")}</button>
          <label className="li-inline" style={{ marginLeft: "auto" }}>
            <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} />
            <span>{t("linkedinCheck.checklist.hideDone")}</span>
          </label>
        </div>
      </div>

      {!hasTransfer && <div className="chk-note" data-tone="info">{t("linkedinCheck.checklist.noDraft")}</div>}

      {SECTIONS.map(sec => {
        const all = cl.items.filter(i => i.section === sec);
        const items = hideDone ? all.filter(i => !i.done) : all;
        if (!all.length) return null;
        const done = all.filter(i => i.done).length;
        // The plan is grouped by week.
        const weeks = sec === "plan" ? [...new Set(items.map(i => Number(i.params.week)))] : [null];
        return (
          <div key={sec} className="chk-card chk-stack" style={{ gap: 6 }}>
            <div className="chk-h" style={{ margin: 0, justifyContent: "space-between" }}>
              <span>{t(`linkedinCheck.checklist.section.${sec}`)}</span>
              <span className="chk-area-score">{done} / {all.length}</span>
            </div>
            {sec === "transfer" && <button type="button" className="btn btn-ghost li-btn" style={{ alignSelf: "flex-start" }} onClick={onShowDraft}>{t("linkedinCheck.checklist.openDraft")}</button>}
            {sec === "basics" && <div className="chk-muted">{t("linkedinCheck.checklist.basicsHint")}</div>}
            {sec === "setup" && <div className="chk-muted">{t("linkedinCheck.checklist.setupHint")}</div>}
            {!items.length && <div className="chk-muted">{t("linkedinCheck.checklist.allDone")}</div>}
            {weeks.map(w => (
              <div key={w ?? "all"}>
                {w != null && <div className="lid-label" style={{ margin: "4px 0" }}>{t("linkedinCheck.checklist.week", { n: w })}</div>}
                <ul className="li-cl">
                  {items.filter(i => w == null || Number(i.params.week) === w).map(i => <ItemRow key={i.key} item={i} s={s} />)}
                </ul>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

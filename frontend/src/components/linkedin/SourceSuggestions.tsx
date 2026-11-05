// "From your documents": skills, certificates and languages that the CV (CV-Check versions or
// Master-CV) and the Documents library hold but the profile doesn't — verbatim from the source,
// computed without AI (backend/src/linkedin-sources.ts). With a draft of the shown language a
// skill chip adds the skill to the draft; without one it copies it for LinkedIn.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Plus, Check, Copy } from "iconoir-react";
import { copyText } from "../../lib/clipboard";
import { CopyBtn, type LiCheckState, type LiSources } from "../../pages/LinkedInCheckTabs";
import "./linkedin.css";

const SKILL_MAX = 100;   // LinkedIn's limit, also enforced by PATCH /api/linkedin/drafts/:id

export function fmtYm(ym: string | null, locale: string) {
  if (!ym) return null;
  const [y, m] = ym.split("-").map(Number);
  return m ? new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "short", year: "numeric" }) : String(y);
}

/** Skill chips from the CV, grouped like the CV. `onAdd` set → click adds (draft); else click copies. */
export function SkillSuggestionChips({ skills, onAdd, busy }: {
  skills: LiSources["skills"]; onAdd?: (names: string[]) => void; busy?: boolean;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<string | null>(null);
  const groups = new Map<string, LiSources["skills"]>();
  for (const s of skills) groups.set(s.group ?? "", [...(groups.get(s.group ?? "") ?? []), s]);
  return (
    <div className="chk-stack" style={{ gap: 6 }}>
      {[...groups].map(([g, xs]) => (
        <div key={g} className="li-kw-sugg">
          {g && <span className="lid-label">{g}</span>}
          <div className="lic-chips">
            {xs.map(s => (
              <button key={s.name} type="button" className="li-kw-add" disabled={busy} data-done={copied === s.name}
                title={`${s.source} · ${t(onAdd ? "linkedinCheck.sources.clickAdd" : "linkedinCheck.sources.clickCopy")}`}
                onClick={async () => {
                  if (onAdd) onAdd([s.name]);
                  else { await copyText(s.name); setCopied(s.name); setTimeout(() => setCopied(c => (c === s.name ? null : c)), 1500); }
                }}>
                {onAdd ? <Plus width={10} height={10} /> : copied === s.name ? <Check width={10} height={10} /> : <Copy width={10} height={10} />}{s.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SourcesCard({ s }: { s: LiCheckState }) {
  const { t, i18n } = useTranslation();
  const src = s.sources;
  if (!src) return null;
  const draft = s.draft;
  const draftSkills = draft?.profile.skills.map(x => x.name) ?? [];
  const skills = draft ? src.skills.filter(x => !x.inDraft) : src.skills.filter(x => !x.inProfile);
  const certs = src.certifications.filter(c => !c.inProfile);
  const langs = src.languages.filter(l => !l.inProfile);
  const hasSources = src.skills.length + src.certifications.length + src.languages.length > 0;
  const addSkills = (names: string[]) => s.patchDraft({ skills: [...draftSkills, ...names].slice(0, SKILL_MAX) });
  const skillsHead = draft ? t("linkedinCheck.sources.skillsDraft", { count: skills.length })
    : src.skillsKnown ? t("linkedinCheck.sources.skillsMissing", { count: skills.length })
      : t("linkedinCheck.sources.skillsUnknown", { count: skills.length });

  return (
    <div className="chk-card chk-stack" style={{ gap: 10 }}>
      <div>
        <div className="chk-h" style={{ margin: 0 }}>{t("linkedinCheck.sources.title")}</div>
        <div className="chk-muted">{t("linkedinCheck.sources.hint")}</div>
      </div>

      {!hasSources && (
        <div className="chk-muted">
          {t("linkedinCheck.sources.none")} <Link to="/cv-check">{t("linkedinCheck.sources.toCvCheck")}</Link> · <Link to="/documents">{t("linkedinCheck.sources.toDocuments")}</Link>
        </div>
      )}
      {hasSources && !skills.length && !certs.length && !langs.length && <div className="chk-muted">{t("linkedinCheck.sources.allIn")}</div>}

      {skills.length > 0 && (
        <div className="li-src-group">
          <div className="li-src-head">
            <div className="chk-h">{t("linkedinCheck.sources.skills")}</div>
            {draft && (
              <button type="button" className="btn btn-secondary li-btn" disabled={s.busyKey === "draft" || draftSkills.length >= SKILL_MAX}
                onClick={() => addSkills(skills.map(x => x.name))}>
                <Plus width={11} height={11} /> {t("linkedinCheck.sources.addAll", { count: Math.min(skills.length, SKILL_MAX - draftSkills.length) })}
              </button>
            )}
          </div>
          <div className="chk-muted">{skillsHead}</div>
          <SkillSuggestionChips skills={skills} onAdd={draft ? addSkills : undefined} busy={s.busyKey === "draft"} />
        </div>
      )}

      {certs.length > 0 && (
        <div className="li-src-group">
          <div className="li-src-head"><div className="chk-h">{t("linkedinCheck.sources.certs", { count: certs.length })}</div></div>
          <div className="chk-muted">{t("linkedinCheck.sources.certsHint")}</div>
          {certs.map(c => (
            <div key={c.name} className="li-src-row">
              <div>
                <div>{c.name}</div>
                <div className="li-src-meta">
                  {[c.issuer && t("linkedinCheck.sources.issuer", { v: c.issuer }), c.date && t("linkedinCheck.sources.issued", { v: fmtYm(c.date, i18n.language) }),
                    c.credentialId && t("linkedinCheck.sources.credentialId", { v: c.credentialId })].filter(Boolean).join(" · ")}
                </div>
                <div className="li-src-sub">{c.sources.map(x => (x.startsWith("doc:") ? t("linkedinCheck.sources.docSource", { name: x.slice(4) }) : x)).join(" · ")}</div>
              </div>
              <CopyBtn text={c.name} />
            </div>
          ))}
        </div>
      )}

      {langs.length > 0 && (
        <div className="li-src-group">
          <div className="li-src-head"><div className="chk-h">{t("linkedinCheck.sources.langs")}</div></div>
          {langs.map(l => (
            <div key={l.name} className="li-src-row">
              <div>
                <div>{l.name}</div>
                <div className="li-src-meta">
                  {l.linkedinLevel ? t(`linkedinCheck.sources.level.${l.linkedinLevel}`) : l.level}{l.level && l.linkedinLevel && ` (${l.level})`}
                </div>
                <div className="li-src-sub">{l.source}</div>
              </div>
              <CopyBtn text={l.name} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

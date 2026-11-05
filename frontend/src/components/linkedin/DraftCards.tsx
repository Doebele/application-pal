// Draft of one LinkedIn profile language as copy cards: every field LinkedIn has its own
// input for gets its own card with a copy button, a character counter against LinkedIn's
// limit and a [X] counter (placeholders must be filled before pasting). Texts are editable
// and saved on blur. Each card can be zoomed to show the current profile text beside it.
// Application-Pal never writes to LinkedIn — the user copies and pastes.
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { User, Journal, Suitcase, GraduationCap, Star, Pin, ChatLines, Calendar, Group, Expand, Collapse, Check, LightBulb } from "iconoir-react";
import type { LinkedInProfile } from "@application-pal/shared";
import { copyText } from "../../lib/clipboard";
import { PtsBadge } from "./ProfileCards";
import { CopyBtn, withPlaceholders, type LiDraft, type DraftPatch, type GenPart, type LiSources } from "../../pages/LinkedInCheckTabs";
import { SkillSuggestionChips } from "./SourceSuggestions";
import "./linkedin.css";

// LinkedIn's input limits.
const LIMIT = { headline: 220, about: 2600, title: 100, description: 2000 } as const;
const xCount = (s: string) => (s.match(/\[X\]/g) ?? []).length;

/** One editable field: label, counters, copy; saves on blur when changed. */
function CopyField({ label, value, limit, rows = 3, onSave, busy }: {
  label: string; value: string; limit: number; rows?: number; onSave: (v: string) => void; busy: boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  const over = text.length > limit;
  const xs = xCount(text);
  const lines = Math.max(rows, Math.min(30, Math.ceil(text.length / 90) + text.split("\n").length));
  return (
    <div className="lid-field">
      <div className="lid-field-head">
        <span className="lid-label">{label}</span>
        {xs > 0 && <span className="lid-x" title={t("linkedinCheck.draft.xHint")}>{xs} × [X]</span>}
        <span className="lid-count" data-over={over}>{text.length} / {limit}</span>
        <CopyBtn text={text} />
      </div>
      <textarea className="lid-input" rows={lines} value={text} disabled={busy} onChange={e => setText(e.target.value)}
        onBlur={() => { if (text !== value) onSave(text); }} />
    </div>
  );
}

/** Read-only line with its own copy button (company, dates, a URL …). */
function CopyLine({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="lid-line">
      <span className="lid-label">{label}</span>
      <span className="lid-line-text">{withPlaceholders(value)}</span>
      <CopyBtn text={value} />
    </div>
  );
}

function DCard({ id, title, icon, groups, checks, zoom, onZoom, missing, children, before }: {
  id: string; title: string; icon: ReactNode; groups?: string[]; checks: LiDraft["result"]["checks"];
  zoom: string | null; onZoom: (id: string | null) => void; missing?: string | null; children?: ReactNode; before?: ReactNode;
}) {
  const { t } = useTranslation();
  if (zoom && zoom !== id) return null;
  const zoomed = zoom === id;
  return (
    <section className="lic-card lid-card" data-zoom={zoomed}>
      <header className="lic-card-head">
        <span className="lic-card-icon">{icon}</span>
        <h3>{title}</h3>
        {groups && <PtsBadge checks={checks} groups={groups} />}
        <button type="button" className="btn btn-ghost btn-icon chk-icon-btn" title={zoomed ? t("linkedinCheck.draft.unzoom") : t("linkedinCheck.draft.zoom")}
          onClick={() => onZoom(zoomed ? null : id)}>
          {zoomed ? <Collapse width={12} height={12} /> : <Expand width={12} height={12} />}
        </button>
      </header>
      {missing ? <div className="lic-ghost">{missing}</div> : zoomed && before ? (
        <div className="lid-compare">
          <div className="lid-before"><div className="lid-label">{t("linkedinCheck.draft.before")}</div>{before}</div>
          <div className="lid-after"><div className="lid-label">{t("linkedinCheck.draft.after")}</div>{children}</div>
        </div>
      ) : children}
    </section>
  );
}

const plain = (s: string | null | undefined) => <div className="lic-text">{s?.trim() || "—"}</div>;

/** `zoom` is owned by the page: enlarging a card also enlarges the panel, and shrinking either
 *  (card button, panel button, Escape) shrinks both. */
export function DraftCards({ draft, before, busy, onPatch, sources, zoom, onZoom }: {
  draft: LiDraft; before: LinkedInProfile | null; busy: boolean; onPatch: (p: DraftPatch) => void; sources?: LiSources | null;
  zoom: string | null; onZoom: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const setZoom = onZoom;
  const p = draft.profile;
  const raw = draft.raw;
  const checks = draft.result.checks;
  const gen = (part: GenPart) => !!raw.generated[part];
  const notYet = (part: GenPart) => t("linkedinCheck.draft.notYet", { part: t(`linkedinCheck.gen.part.${part}`) });
  const common = { checks, zoom, onZoom: setZoom };
  const beforePos = (id: string) => before?.positions.find(x => x.id === id);
  // CV skills not in the draft yet — one click adds them (verbatim from the CV, so no [X]).
  const cvSkills = (sources?.skills ?? []).filter(x => !x.inDraft);
  const addSkills = (names: string[]) => onPatch({ skills: [...p.skills.map(s => s.name), ...names].slice(0, 100) });

  return (
    <div className="lic-stack">
      <div className="lid-banner">
        <span>{t("linkedinCheck.draft.banner", { lang: t(`linkedinCheck.lang.${draft.lang}`) })}</span>
        {draft.placeholders > 0 && <span className="lid-x">{t("linkedinCheck.draft.placeholders", { count: draft.placeholders })}</span>}
      </div>

      <DCard id="headline" title={t("linkedinCheck.draft.headline")} icon={<User width={13} height={13} />} groups={["headline"]} {...common}
        missing={!gen("intro") && !p.basics.headline ? notYet("intro") : null} before={plain(before?.basics.headline)}>
        <CopyField label={t("linkedinCheck.draft.headline")} value={p.basics.headline ?? ""} limit={LIMIT.headline} rows={2} busy={busy} onSave={v => onPatch({ headline: v })} />
        {raw.headlineVariants.length > 1 && (
          <div className="lid-variants">
            <div className="lid-label">{t("linkedinCheck.draft.variants")}</div>
            {raw.headlineVariants.map((v, i) => (
              <div key={i} className="lid-variant" data-active={v.text === p.basics.headline}>
                <span className="li-kind" style={{ marginLeft: 0 }}>{t(`linkedinCheck.tools.variant.${v.type}`, v.type)}</span>
                <span className="lid-variant-text">{withPlaceholders(v.text)}</span>
                {v.text === p.basics.headline
                  ? <Check width={12} height={12} className="li-gen-ok" />
                  : <button type="button" className="btn btn-ghost li-btn" disabled={busy} onClick={() => onPatch({ headline: v.text })}>{t("linkedinCheck.draft.useVariant")}</button>}
                <CopyBtn text={v.text} />
              </div>
            ))}
          </div>
        )}
      </DCard>

      <DCard id="about" title={t("linkedinCheck.draft.about")} icon={<Journal width={13} height={13} />} groups={["about"]} {...common}
        missing={!gen("intro") && !p.basics.summary ? notYet("intro") : null} before={plain(before?.basics.summary)}>
        <CopyField label={t("linkedinCheck.draft.about")} value={p.basics.summary ?? ""} limit={LIMIT.about} rows={10} busy={busy} onSave={v => onPatch({ summary: v })} />
      </DCard>

      <DCard id="experience" title={t("linkedinCheck.draft.experience")} icon={<Suitcase width={13} height={13} />} groups={["experience"]} {...common}
        missing={!p.positions.length ? notYet("positions") : null}
        before={<div className="lic-stack" style={{ gap: 8, margin: 0 }}>{(before?.positions ?? []).map(x => (
          <div key={x.id} className="lic-item"><div className="lic-item-title">{x.title}</div><div className="lic-item-sub">{x.company}</div>{plain(x.description)}</div>
        ))}</div>}>
        {p.positions.map(x => (
          <div key={x.id} className="lid-item">
            <CopyField label={t("linkedinCheck.draft.posTitle")} value={x.title ?? ""} limit={LIMIT.title} rows={1} busy={busy}
              onSave={v => onPatch({ positions: [{ id: x.id, title: v }] })} />
            <CopyLine label={t("linkedinCheck.draft.company")} value={x.company} />
            <CopyLine label={t("linkedinCheck.draft.dates")} value={[x.start, x.end ?? t("linkedinCheck.cards.present")].filter(Boolean).join(" – ")} />
            <CopyField label={t("linkedinCheck.draft.description")} value={x.description ?? ""} limit={LIMIT.description} rows={5} busy={busy}
              onSave={v => onPatch({ positions: [{ id: x.id, description: v }] })} />
            {!!raw.positionSkills[x.id]?.length && <CopyLine label={t("linkedinCheck.draft.posSkills")} value={raw.positionSkills[x.id].join(", ")} />}
            {zoom !== "experience" && beforePos(x.id)?.description && beforePos(x.id)?.description !== x.description && (
              <details className="lid-prev"><summary>{t("linkedinCheck.draft.before")}</summary>{plain(beforePos(x.id)?.description)}</details>
            )}
          </div>
        ))}
      </DCard>

      {p.education.length > 0 && (
        <DCard id="education" title={t("linkedinCheck.draft.education")} icon={<GraduationCap width={13} height={13} />} groups={["extras"]} {...common}>
          {p.education.map(e => (
            <div key={e.id} className="lid-item">
              <CopyLine label={t("linkedinCheck.draft.school")} value={e.school} />
              <CopyLine label={t("linkedinCheck.draft.degree")} value={e.degree} />
              <CopyLine label={t("linkedinCheck.draft.dates")} value={[e.start, e.end].filter(Boolean).join(" – ")} />
            </div>
          ))}
        </DCard>
      )}

      <DCard id="skills" title={t("linkedinCheck.draft.skills", { count: p.skills.length })} icon={<Star width={13} height={13} />} groups={["skills"]} {...common}
        missing={!p.skills.length && !cvSkills.length ? notYet("skills") : null}>
        {p.skills.length > 0 && <SkillsEditor names={p.skills.map(s => s.name)} verified={raw.skills} busy={busy} onSave={skills => onPatch({ skills })} />}
        {cvSkills.length > 0 && (
          <div className="li-src-group">
            <div className="li-src-head">
              <span className="lid-label" style={{ flex: 1 }}>{t("linkedinCheck.sources.fromCv", { count: cvSkills.length })}</span>
              <button type="button" className="btn btn-ghost li-btn" disabled={busy} onClick={() => addSkills(cvSkills.map(x => x.name))}>
                {t("linkedinCheck.sources.addAll", { count: Math.min(cvSkills.length, 100 - p.skills.length) })}
              </button>
            </div>
            <SkillSuggestionChips skills={cvSkills} onAdd={addSkills} busy={busy} />
          </div>
        )}
      </DCard>

      <DCard id="featured" title={t("linkedinCheck.draft.featured")} icon={<Pin width={13} height={13} />} groups={["featured"]} {...common}
        missing={!raw.featured.length ? notYet("skills") : null}>
        <div className="lid-muted">{t("linkedinCheck.draft.featuredHint")}</div>
        {raw.featured.map((f, i) => (
          <div key={i} className="lid-item">
            <CopyLine label={t(`linkedinCheck.draft.kind.${f.kind}`, f.kind)} value={f.title} />
            {f.url && <CopyLine label="URL" value={f.url} />}
            {f.why && <div className="lid-muted">{f.why}</div>}
          </div>
        ))}
      </DCard>

      <DCard id="recs" title={t("linkedinCheck.draft.recRequests")} icon={<ChatLines width={13} height={13} />} groups={["recommendations"]} {...common}
        missing={!raw.recRequests.length ? notYet("activity") : null}>
        <div className="lid-muted">{t("linkedinCheck.draft.recHint")}</div>
        {raw.recRequests.map((r, i) => (
          <div key={i} className="lid-item">
            <div className="lid-field-head"><span className="lid-label">{r.to}</span><CopyBtn text={r.text} /></div>
            <div className="lic-text">{withPlaceholders(r.text)}</div>
          </div>
        ))}
      </DCard>

      <DCard id="pillars" title={t("linkedinCheck.draft.pillars")} icon={<LightBulb width={13} height={13} />} groups={["posts"]} {...common}
        missing={!raw.pillars.length ? notYet("activity") : null}>
        {raw.pillars.map((pl, i) => (
          <div key={i} className="lid-item">
            <div className="lic-item-title">{pl.title}</div>
            {pl.why && <div className="lid-muted">{pl.why}</div>}
            <ul className="lid-list">{pl.ideas.map((idea, j) => <li key={j}><span>{withPlaceholders(idea)}</span><CopyBtn text={idea} /></li>)}</ul>
          </div>
        ))}
      </DCard>

      <DCard id="groups" title={t("linkedinCheck.draft.groups")} icon={<Group width={13} height={13} />} groups={["network"]} {...common}
        missing={!raw.groups ? notYet("activity") : null}>
        {raw.groups && <>
          <div className="lid-muted">{t("linkedinCheck.draft.groupsHint")}</div>
          <ul className="lid-list">{raw.groups.criteria.map((c, i) => <li key={i}><span>{c}</span></li>)}</ul>
          <div className="lid-label">{t("linkedinCheck.draft.searchTerms")}</div>
          <div className="lic-chips">{raw.groups.searchTerms.map(term => <ChipCopy key={term} text={term} />)}</div>
        </>}
      </DCard>

      <DCard id="plan" title={t("linkedinCheck.draft.plan")} icon={<Calendar width={13} height={13} />} {...common}
        missing={!raw.plan.length ? notYet("activity") : null}>
        {raw.plan.map(w => (
          <div key={w.week} className="lid-item">
            <div className="lic-item-title">{t("linkedinCheck.draft.week", { n: w.week })}</div>
            <ul className="lid-list">{w.tasks.map((task, j) => <li key={j}><span>{task}</span></li>)}</ul>
          </div>
        ))}
      </DCard>
    </div>
  );
}

/** A chip that copies its text on click (LinkedIn adds skills / search terms one at a time). */
function ChipCopy({ text, flag }: { text: string; flag?: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="li-stat lid-chip" data-flag={flag} title={flag === "unverified" ? t("linkedinCheck.draft.unverifiedSkill") : t("check.copy")}
      onClick={async () => { await copyText(text); setDone(true); setTimeout(() => setDone(false), 1200); }}>
      {done ? <Check width={9} height={9} /> : null}{text}{flag === "unverified" ? " ?" : ""}
    </button>
  );
}

function SkillsEditor({ names, verified, busy, onSave }: { names: string[]; verified: Array<{ name: string; verified: boolean }>; busy: boolean; onSave: (skills: string[]) => void }) {
  const { t } = useTranslation();
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(names.join("\n"));
  useEffect(() => { setText(names.join("\n")); }, [names.join("\n")]); // eslint-disable-line react-hooks/exhaustive-deps
  const unverified = new Set(verified.filter(v => !v.verified).map(v => v.name.toLowerCase()));
  return (
    <div className="chk-stack" style={{ gap: 8 }}>
      <div className="lid-muted">{t("linkedinCheck.draft.skillsHint")}{unverified.size > 0 && <> {t("linkedinCheck.draft.skillsUnverified", { count: unverified.size })}</>}</div>
      {!edit ? (
        <div className="lic-chips">
          {names.map((n, i) => <ChipCopy key={n} text={n} flag={unverified.has(n.toLowerCase()) ? "unverified" : i < 5 ? "top" : undefined} />)}
        </div>
      ) : (
        <textarea className="lid-input" rows={Math.min(20, names.length + 2)} value={text} onChange={e => setText(e.target.value)} />
      )}
      <div className="li-actions">
        {edit
          ? <button type="button" className="btn btn-primary li-btn" disabled={busy} onClick={() => { onSave(text.split("\n").map(x => x.trim()).filter(Boolean)); setEdit(false); }}>{t("linkedinCheck.draft.save")}</button>
          : <button type="button" className="btn btn-ghost li-btn" onClick={() => setEdit(true)}>{t("linkedinCheck.draft.editSkills")}</button>}
        <CopyBtn text={names.join(", ")} />
      </div>
    </div>
  );
}

// LinkedIn-like rendering of the imported profile, one card per section, each with
// its points from the check. Missing sections are ghost cards that show what they could
// add. Clicking a card focuses its group in the "Bewertung" tab.
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, Globe, Group, Medal, Language, Suitcase, GraduationCap, Star, ChatLines, Journal, Pin, User } from "iconoir-react";
import type { LinkedInProfile } from "@application-pal/shared";
import type { CheckOutcome } from "../check/types";
import "./linkedin.css";

type Pts = { score: number; max: number; full: number; rated: boolean };
const pts = (checks: CheckOutcome[], groups: string[]): Pts => {
  const xs = checks.filter(c => groups.includes(c.group));
  const rated = xs.filter(c => c.status !== "na");
  return {
    score: Math.max(0, rated.reduce((s, c) => s + c.score, 0)),
    max: rated.reduce((s, c) => s + c.max, 0),
    full: xs.reduce((s, c) => s + c.max, 0),
    rated: rated.length > 0,
  };
};
const tone = (p: Pts) => (!p.rated ? "na" : p.max && p.score / p.max >= 0.8 ? "good" : p.max && p.score / p.max >= 0.5 ? "onTrack" : "needsWork");

function Card({ title, icon, groups, checks, onFocus, ghost, children }: {
  title: string; icon: ReactNode; groups: string[]; checks: CheckOutcome[]; onFocus: (g: string) => void; ghost?: boolean; children?: ReactNode;
}) {
  const { t } = useTranslation();
  const p = pts(checks, groups);
  return (
    <section className="lic-card" data-ghost={!!ghost} role="button" tabIndex={0}
      onClick={() => onFocus(groups[0])} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onFocus(groups[0]); } }}>
      <header className="lic-card-head">
        <span className="lic-card-icon">{icon}</span>
        <h3>{title}</h3>
        <span className="lic-pts" data-status={tone(p)} title={p.rated ? t("linkedinCheck.cards.ptsTitle", { full: p.full }) : t("linkedinCheck.notRated")}>
          {p.rated ? `${Math.round(p.score * 10) / 10} / ${p.max}` : t("linkedinCheck.cards.notRatedShort")}
        </span>
      </header>
      {ghost
        ? <div className="lic-ghost">{t("linkedinCheck.cards.ghost", { n: p.full })}</div>
        : children}
    </section>
  );
}

const clean = (s: string | null | undefined) => (s ?? "").trim();
const range = (a?: string | null, b?: string | null, now = "") => [clean(a), clean(b) || now].filter(Boolean).join(" – ");

export function ProfileCards({ profile, checks, onFocus }: { profile: LinkedInProfile; checks: CheckOutcome[]; onFocus: (g: string) => void }) {
  const { t } = useTranslation();
  const b = profile.basics;
  const name = [b.firstName, b.lastName].filter(Boolean).join(" ") || t("linkedinCheck.cards.noName");
  const initials = name.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const present = (d: string) => !profile.meta.present || profile.meta.present.includes(d);
  const posts = profile.activity.posts.length + profile.activity.articles.length;
  const comments = profile.activity.comments.length;
  const extrasEmpty = !profile.projects.length && !profile.education.length && !profile.certifications.length;
  const honorsEmpty = !profile.honors.length && !profile.publications.length && !profile.languages.length;
  const now = t("linkedinCheck.cards.present");

  return (
    <div className="lic-stack">
      {/* Intro: banner, photo, headline, basics */}
      <Card title={t("linkedinCheck.cards.intro")} icon={<User width={13} height={13} />} groups={["headline", "photo", "banner", "basics"]} checks={checks} onFocus={onFocus}>
        <div className="lic-banner" onClick={e => { e.stopPropagation(); onFocus("banner"); }} title={t("linkedinCheck.group.banner")}>
          <span>{t("linkedinCheck.cards.bannerSelf")}</span>
        </div>
        <div className="lic-intro">
          <div className="lic-avatar" onClick={e => { e.stopPropagation(); onFocus("photo"); }} title={t("linkedinCheck.group.photo")}>{initials}</div>
          <div className="lic-name">{name}</div>
          <div className="lic-headline" onClick={e => { e.stopPropagation(); onFocus("headline"); }}>
            {clean(b.headline) || <span className="lic-missing">{t("linkedinCheck.cards.noHeadline")}</span>}
          </div>
          <div className="lic-meta" onClick={e => { e.stopPropagation(); onFocus("basics"); }}>
            {b.location && <span><MapPin width={11} height={11} /> {b.location}</span>}
            {profile.network.connections != null && <span><Group width={11} height={11} /> {t("linkedinCheck.cards.connections", { n: profile.network.connections })}</span>}
            {b.publicUrl && <span className="lic-url">{b.publicUrl.replace(/^https?:\/\/(www\.)?/, "")}</span>}
            {b.websites.map(w => <span key={w}><Globe width={11} height={11} /> {w.replace(/^https?:\/\//, "")}</span>)}
          </div>
        </div>
      </Card>

      <Card title={t("linkedinCheck.group.featured")} icon={<Pin width={13} height={13} />} groups={["featured"]} checks={checks} onFocus={onFocus}>
        <div className="lic-muted">{t("linkedinCheck.cards.featuredSelf")}</div>
      </Card>

      <Card title={t("linkedinCheck.group.about")} icon={<Journal width={13} height={13} />} groups={["about"]} checks={checks} onFocus={onFocus} ghost={!clean(b.summary)}>
        <div className="lic-text">{b.summary}</div>
        <div className="lic-muted">{t("linkedinCheck.cards.chars", { n: clean(b.summary).length })}</div>
      </Card>

      <Card title={t("linkedinCheck.cards.activity")} icon={<ChatLines width={13} height={13} />} groups={["posts", "comments"]} checks={checks} onFocus={onFocus}
        ghost={present("MEMBER_SHARE_INFO") && !posts && !comments}>
        {present("MEMBER_SHARE_INFO") || present("ALL_COMMENTS") ? (
          <>
            <div className="lic-muted">{t("linkedinCheck.cards.activityStats", { posts, comments })}</div>
            {profile.activity.posts.slice(0, 3).map((p, i) => (
              <div key={i} className="lic-post"><span className="lic-muted">{clean(p.date).slice(0, 10)}</span> {clean(p.text).slice(0, 180)}{clean(p.text).length > 180 && "…"}</div>
            ))}
          </>
        ) : <div className="lic-muted">{t("linkedinCheck.cards.notInSource")}</div>}
      </Card>

      <Card title={t("linkedinCheck.group.experience")} icon={<Suitcase width={13} height={13} />} groups={["experience"]} checks={checks} onFocus={onFocus} ghost={!profile.positions.length}>
        {profile.positions.map(p => (
          <div key={p.id} className="lic-item">
            <div className="lic-item-title">{p.title}</div>
            <div className="lic-item-sub">{[p.company, p.location].filter(Boolean).join(" · ")}</div>
            <div className="lic-muted">{range(p.start, p.end, now)}</div>
            {clean(p.description)
              ? <div className="lic-text lic-clamp">{p.description}</div>
              : <div className="lic-missing">{t("linkedinCheck.cards.noDescription")}</div>}
          </div>
        ))}
      </Card>

      <Card title={t("linkedinCheck.cards.extras")} icon={<GraduationCap width={13} height={13} />} groups={["extras"]} checks={checks} onFocus={onFocus} ghost={extrasEmpty}>
        {profile.education.map(e => (
          <div key={e.id} className="lic-item"><div className="lic-item-title">{e.school}</div><div className="lic-item-sub">{e.degree}</div><div className="lic-muted">{range(e.start, e.end)}</div></div>
        ))}
        {profile.projects.length > 0 && <div className="lic-sub">{t("linkedinCheck.cards.projects")}: {profile.projects.map(p => p.title).join(" · ")}</div>}
        {profile.certifications.length > 0 && <div className="lic-sub">{t("linkedinCheck.cards.certs")}: {profile.certifications.map(c => [c.name, clean(c.start)].filter(Boolean).join(" ")).join(" · ")}</div>}
      </Card>

      <Card title={t("linkedinCheck.group.skills")} icon={<Star width={13} height={13} />} groups={["skills"]} checks={checks} onFocus={onFocus} ghost={!profile.skills.length}>
        <div className="lic-chips">
          {profile.skills.slice(0, 40).map(s => <span key={s.name} className="li-stat">{s.name}{s.endorsements ? ` · ${s.endorsements}` : ""}</span>)}
        </div>
        <div className="lic-muted">{t("linkedinCheck.cards.skillCount", { n: profile.skills.length })}{!present("SKILLS") && ` · ${t("linkedinCheck.cards.partialSkills")}`}</div>
      </Card>

      <Card title={t("linkedinCheck.group.recommendations")} icon={<ChatLines width={13} height={13} />} groups={["recommendations"]} checks={checks} onFocus={onFocus}
        ghost={present("RECOMMENDATIONS") && !profile.recommendations.received.length}>
        {!present("RECOMMENDATIONS") ? <div className="lic-muted">{t("linkedinCheck.cards.notInSource")}</div>
          : profile.recommendations.received.slice(0, 3).map(r => (
            <div key={r.id} className="lic-item"><div className="lic-item-sub">{[r.author, r.jobTitle, r.company].filter(Boolean).join(" · ")} <span className="lic-muted">{clean(r.date)}</span></div>
              <div className="lic-text lic-clamp">{r.text}</div></div>
          ))}
      </Card>

      <Card title={t("linkedinCheck.group.honors")} icon={<Medal width={13} height={13} />} groups={["honors"]} checks={checks} onFocus={onFocus} ghost={honorsEmpty}>
        {profile.honors.length > 0 && <div className="lic-sub">{t("linkedinCheck.cards.awards")}: {profile.honors.map(h => h.title).join(" · ")}</div>}
        {profile.publications.length > 0 && <div className="lic-sub">{t("linkedinCheck.cards.publications")}: {profile.publications.map(h => h.title).join(" · ")}</div>}
        {profile.languages.length > 0 && <div className="lic-sub"><Language width={11} height={11} style={{ verticalAlign: -1 }} /> {profile.languages.map(l => l.proficiency ? `${l.name} (${l.proficiency})` : l.name).join(" · ")}</div>}
      </Card>

      <Card title={t("linkedinCheck.group.network")} icon={<Group width={13} height={13} />} groups={["network"]} checks={checks} onFocus={onFocus}>
        <div className="lic-muted">
          {profile.network.connections != null ? t("linkedinCheck.cards.connections", { n: profile.network.connections }) : t("linkedinCheck.cards.notInSource")}
          {present("GROUPS") && ` · ${t("linkedinCheck.cards.groups", { n: profile.network.groups.length })}`}
        </div>
      </Card>
    </div>
  );
}

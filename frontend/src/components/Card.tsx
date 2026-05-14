import { useState } from "react";
import { Clock, Pin, MoreHorizontal, ExternalLink, Archive } from "lucide-react";
import type { Application } from "@application-pal/shared";
import type { CardVariant } from "../lib/store";
import { ARCHIVE_REASON_LABELS } from "./DetailDrawer";

function getInitials(company: string): string {
  return company.slice(0, 2).toUpperCase();
}

function getCompanyColor(company: string): string {
  const colors = [
    "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#f43f5e",
    "#06b6d4", "#84cc16", "#f97316", "#a78bfa", "#34d399"
  ];
  let hash = 0;
  for (let i = 0; i < company.length; i++) hash = company.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function parseTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  try { return JSON.parse(tags); } catch { return tags.split(",").map((t) => t.trim()).filter(Boolean); }
}

function daysInStage(updatedAt: Date | string): number {
  return Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
}

type CardProps = { app: Application; onClick?: () => void };

function Avatar({ company, logoUrl, size = "sm" }: { company: string; logoUrl?: string | null; size?: "sm" | "lg" }) {
  const [imgOk, setImgOk] = useState(false);
  const cls = size === "lg" ? "avatar avatar-lg" : "avatar avatar-sm";

  return (
    <div
      className={cls}
      style={{
        background: imgOk ? "#fff" : getCompanyColor(company),
        border: "none",
        padding: imgOk ? 3 : 0,
        overflow: "hidden"
      }}
    >
      {logoUrl && (
        <img
          src={logoUrl}
          alt=""
          onLoad={() => setImgOk(true)}
          onError={() => setImgOk(false)}
          style={{
            display: imgOk ? "block" : "none",
            width: "100%", height: "100%",
            objectFit: "contain", borderRadius: 4
          }}
        />
      )}
      {!imgOk && getInitials(company)}
    </div>
  );
}

function SourceDot({ source }: { source: string | null | undefined }) {
  if (!source) return null;
  const labels: Record<string, string> = {
    linkedin: "LinkedIn", indeed: "Indeed", direct: "Direct",
    xing: "Xing", stepstone: "StepStone"
  };
  return (
    <span className={`chip src-${source}`} style={{ paddingLeft: 8 }}>
      <span className="src-dot" />
      {labels[source] ?? source}
    </span>
  );
}

function PriorityBar({ priority }: { priority: string | null | undefined }) {
  if (!priority || priority === "low") return null;
  return <span className={`priority-bar ${priority === "high" ? "priority-high" : "priority-medium"}`} />;
}

const STAGE_COLORS: Record<string, string> = {
  import_validating: "#94a3b8", preparing_cv: "#60a5fa", preparing_letter: "#22d3ee",
  application_sent: "#a78bfa", pending: "#fbbf24", interview_1: "#34d399",
  interview_2: "#10b981", rejected: "#f87171", accepted: "#84cc16"
};
const STAGE_LABELS: Record<string, string> = {
  import_validating: "Inbox", preparing_cv: "CV", preparing_letter: "Letter",
  application_sent: "Submitted", pending: "Pending", interview_1: "1st Itw",
  interview_2: "2nd Itw", rejected: "Rejected", accepted: "Accepted"
};

export function CardRich({ app, onClick }: CardProps) {
  const tags = parseTags(app.tags);
  const days = daysInStage(app.updatedAt);
  const stageColor = STAGE_COLORS[app.stage] ?? "#94a3b8";

  return (
    <div className="job-card" onClick={onClick}>
      <PriorityBar priority={app.priority} />
      {/* Row 1: Avatar + company/role + Stage chip */}
      <div className="job-head">
        <Avatar company={app.company} logoUrl={app.logoUrl} size="sm" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="job-title">{app.role}</div>
          <div className="job-company">{app.company}{app.location ? ` · ${app.location.split("·")[0].trim()}` : ""}</div>
        </div>
        {/* Stage badge + optional match score */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
          <span style={{ padding: "2px 7px", borderRadius: 999, fontSize: 9.5, fontWeight: 700, background: `${stageColor}1a`, color: stageColor, border: `1px solid ${stageColor}44`, whiteSpace: "nowrap" }}>
            {STAGE_LABELS[app.stage] ?? app.stage}
          </span>
          {app.matchScore != null && (
            <span style={{
              padding: "1px 6px", borderRadius: 999, fontSize: 11, fontWeight: 300, whiteSpace: "nowrap",
              background: app.matchScore >= 75 ? "rgba(52,211,153,0.15)" : app.matchScore >= 50 ? "rgba(251,191,36,0.15)" : "rgba(248,113,113,0.15)",
              color: app.matchScore >= 75 ? "#34d399" : app.matchScore >= 50 ? "#fbbf24" : "#f87171",
              border: `1px solid ${app.matchScore >= 75 ? "#34d39944" : app.matchScore >= 50 ? "#fbbf2444" : "#f8717144"}`
            }}>
              {app.matchScore}%
            </span>
          )}
        </div>
      </div>

      {/* Archive reason label */}
      {app.archiveReason && (
        <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            padding: "1px 7px", borderRadius: 999, fontSize: 10, fontWeight: 400,
            color: "#f87171", border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.07)", whiteSpace: "nowrap"
          }}>
            <Archive size={9} />
            {ARCHIVE_REASON_LABELS[app.archiveReason] ?? app.archiveReason}
          </span>
        </div>
      )}

      {/* Row 2: Tags + Salary */}
      {(tags.length > 0 || app.salary) && (
        <div className="job-meta">
          {tags.slice(0, 2).map((t) => <span key={t} className="tag">{t}</span>)}
          {app.salary && <span className="tag mono" style={{ color: "var(--fg-2)" }}>{app.salary}</span>}
        </div>
      )}

      {/* Row 3: Next step callout */}
      {app.nextDeadline && (
        <div className="job-deadline">
          <Pin size={11} /> {app.nextDeadline}
        </div>
      )}

      {/* Footer: source + days + external link */}
      <div className="job-foot">
        <SourceDot source={app.source} />
        <div className="job-foot-spacer" />
        {app.url && (
          <a href={app.url} target="_blank" rel="noreferrer"
            className="btn btn-ghost btn-icon" style={{ padding: 3, color: "var(--fg-3)" }}
            onClick={(e) => e.stopPropagation()} title="Open original posting">
            <ExternalLink size={11} />
          </a>
        )}
        <span className="mono" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5 }}>
          <Clock size={11} />
          {days === 0 ? "Today" : `${days}d`}
        </span>
      </div>
    </div>
  );
}

export function CardCompact({ app, onClick }: CardProps) {
  const days = daysInStage(app.updatedAt);
  return (
    <div className="job-card" onClick={onClick} style={{ padding: 10, gap: 6 }}>
      <PriorityBar priority={app.priority} />
      <div className="job-head" style={{ alignItems: "center" }}>
        <Avatar company={app.company} logoUrl={app.logoUrl} size="sm" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="job-title" style={{ fontSize: 12.5 }}>{app.role}</div>
          <div className="job-company">{app.company}</div>
        </div>
        <span className="mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>{days}d</span>
      </div>
    </div>
  );
}

export function CardMinimal({ app, onClick }: CardProps) {
  return (
    <div
      className="job-card"
      onClick={onClick}
      style={{ padding: "10px 12px", gap: 4, flexDirection: "row", alignItems: "center" }}
    >
      <Avatar company={app.company} logoUrl={app.logoUrl} size="sm" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5, fontWeight: 700, color: "var(--fg-1)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
          }}
        >
          {app.company}
        </div>
        <div
          style={{
            fontSize: 11, color: "var(--fg-3)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
          }}
        >
          {app.role}
        </div>
      </div>
      {app.priority === "high" && (
        <span style={{ width: 6, height: 6, borderRadius: 999, background: "#f87171", flexShrink: 0 }} />
      )}
    </div>
  );
}

export function CardEditorial({ app, onClick }: CardProps) {
  const tags = parseTags(app.tags);
  return (
    <div className="job-card" onClick={onClick} style={{ padding: 14, gap: 10 }}>
      <PriorityBar priority={app.priority} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <Avatar company={app.company} logoUrl={app.logoUrl} size="lg" />
        <SourceDot source={app.source} />
      </div>
      <div>
        <div style={{ fontSize: 11, color: "var(--fg-3)", letterSpacing: "0.02em" }}>{app.company}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg-1)", letterSpacing: "-0.01em", lineHeight: 1.25, marginTop: 2 }}>
          {app.role}
        </div>
      </div>
      {tags.length > 0 && (
        <div className="job-meta">
          {tags.map((t) => <span key={t} className="tag">{t}</span>)}
        </div>
      )}
      <div className="job-foot">
        <span style={{ color: "var(--fg-3)" }}>{app.location ?? ""}</span>
        <div className="job-foot-spacer" />
        {app.salary && <span className="mono">{app.salary}</span>}
      </div>
    </div>
  );
}

const CARD_MAP: Record<string, React.ComponentType<CardProps>> = {
  rich: CardRich,
  compact: CardCompact,
  minimal: CardMinimal,
  editorial: CardEditorial
};

export function ApplicationCard({
  app,
  variant,
  onClick
}: {
  app: Application;
  variant: CardVariant;
  onClick?: () => void;
}) {
  const CardComponent = CARD_MAP[variant] ?? CardRich;
  return <CardComponent app={app} onClick={onClick} />;
}

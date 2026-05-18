import { useState, useCallback, useRef, useEffect } from "react";
import {
  Xmark, OpenNewWindow, MoreHoriz, Check, Sparks, Refresh,
  NavArrowRight, Link, Plus, Mail, Phone, Calendar, Page,
  RefreshCircle, Trash, EditPencil, ChatBubbleEmpty, Clock, NavArrowDown, Archive, Copy,
  BrainElectricity, PageEdit, SendMail, Coins,
  Calendar as IcCalendar, CalendarArrowDown,
  Copy as IcCopy, MailOut, Brain,
  MapPin, VideoCamera, Expand, Collapse,
  Search, Spark, Building, CheckCircle, Linkedin, ChatBubbleCheck, Star,
} from "iconoir-react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  Application, ApplicationDocument, ApplicationActivity, ApplicationContact, UserDocument
} from "@application-pal/shared";
import { api } from "../lib/api";
import { useUiStore } from "../lib/store";

type Tab = "process" | "details" | "documents" | "insights" | "contacts" | "notes";

// Clipboard helper: tries modern API first, falls back to execCommand for focus/permission issues
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

const TABS: { id: Tab; label: string }[] = [
  { id: "process",     label: "Aktionen"       },
  { id: "details",     label: "Details"        },
  { id: "documents",   label: "Dokumente"      },
  { id: "insights",     label: "Insights"       },
  { id: "contacts",    label: "Kontakte"       },
  { id: "notes",       label: "Notizen"        },
];

const STAGES = [
  { id: "import_validating", label: "Inbox",            short: "Inbox" },
  { id: "preparing_cv",      label: "Preparing CV",     short: "CV" },
  { id: "preparing_letter",  label: "Preparing Letter", short: "Letter" },
  { id: "application_sent",  label: "Submitted",        short: "Sent" },
  { id: "pending",           label: "Pending",          short: "Pending" },
  { id: "interview_1",       label: "1st Interview",    short: "1st Itw" },
  { id: "interview_2",       label: "2nd Interview",    short: "2nd Itw" },
  { id: "rejected",          label: "Rejected",         short: "Rejected" },
  { id: "accepted",          label: "Accepted",         short: "Accepted" },
];

const STAGE_LABELS: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.id, s.label]));

export const ARCHIVE_REASON_LABELS: Record<string, string> = {
  unavailable: "Stelle nicht mehr verfügbar",
  irrelevant:  "Nicht relevant",
  taken:       "Bereits vergeben",
  other:       "Sonstiger Grund",
};

const STAGE_COLORS: Record<string, string> = {
  import_validating: "#94a3b8", preparing_cv: "#60a5fa", preparing_letter: "#22d3ee",
  application_sent: "#a78bfa", pending: "#fbbf24", interview_1: "#34d399",
  interview_2: "#10b981", rejected: "#f87171", accepted: "#84cc16"
};

// ─── Stage Picker (header) ────────────────────────────────────
function StagePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const color = STAGE_COLORS[value] ?? "#94a3b8";
  const label = STAGE_LABELS[value] ?? value;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button onClick={() => setOpen((v) => !v)} style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "4px 10px", borderRadius: 999,
        border: `1px solid ${color}55`, background: `${color}14`,
        color, fontSize: 11, fontWeight: 700, cursor: "pointer",
        fontFamily: "var(--font-sans)", whiteSpace: "nowrap"
      }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: color, flexShrink: 0 }} />
        {label}
        <NavArrowDown width={11} height={11} style={{ opacity: 0.7, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60,
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: 10, padding: 4, minWidth: 180,
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)"
        }}>
          {STAGES.map((s) => {
            const sc = STAGE_COLORS[s.id] ?? "#94a3b8";
            return (
              <button key={s.id} onClick={() => { onChange(s.id); setOpen(false); }} style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "6px 10px", borderRadius: 7, border: "none",
                background: value === s.id ? `${sc}14` : "transparent",
                color: value === s.id ? sc : "var(--fg-1)",
                fontSize: 12, fontWeight: value === s.id ? 700 : 500,
                cursor: "pointer", fontFamily: "var(--font-sans)", textAlign: "left"
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: sc, flexShrink: 0 }} />
                {s.label}
                {value === s.id && <Check width={11} height={11} style={{ marginLeft: "auto", color: sc }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function daysAgo(date: Date | string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}
function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}
function getCompanyColor(company: string): string {
  const colors = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#f43f5e","#06b6d4","#84cc16","#f97316"];
  let hash = 0;
  for (let i = 0; i < company.length; i++) hash = company.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function AutoTextarea({ value, onChange, onBlur, placeholder, minRows = 3 }: {
  value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur?: () => void; placeholder?: string; minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = "auto"; el.style.height = el.scrollHeight + "px";
  }, [value]);
  return <textarea ref={ref} value={value} onChange={onChange} onBlur={onBlur}
    placeholder={placeholder} rows={minRows} style={{ resize: "none", overflow: "hidden", background: "transparent", color: "var(--fg-1)", fontFamily: "var(--font-sans)", fontSize: 13, outline: "none" }} />;
}

function AgentStep({ done, active, label, meta }: { done: boolean; active: boolean; label: string; meta?: string }) {
  return (
    <div className={`agent-step${done ? " done" : ""}${active ? " active" : ""}`}>
      <div className="pip">
        {done ? <Check width={11} height={11} /> : active
          ? <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--accent)", display: "block" }} />
          : <span style={{ width: 6, height: 6, borderRadius: 999, background: "currentColor", display: "block" }} />}
      </div>
      <div style={{ flex: 1 }}>
        <div className="step-label">{label}</div>
        {meta && <div className="step-meta">{meta}</div>}
      </div>
    </div>
  );
}

// ─── Stage Progress Bar ───────────────────────────────────────
function StageProgressBar({ stage }: { stage: string }) {
  // Linear stages: Inbox → 2nd Itw (fork terminals excluded)
  const LINEAR = STAGES.filter(s => s.id !== "rejected" && s.id !== "accepted");
  const linIdx    = LINEAR.findIndex(s => s.id === stage); // -1 when on fork
  const onAccepted = stage === "accepted";
  const onRejected = stage === "rejected";
  const inFork     = onAccepted || onRejected;

  const P = "var(--fg-3)";         // past
  const F = "var(--border)";        // future
  const A = "var(--accent)";        // active

  // Line color entering linear node i
  const lineC = (i: number) => {
    if (inFork) return P;           // all linear stages done
    if (i < linIdx) return P;
    if (i === linIdx) return A;     // line leading into current = accent
    return F;
  };

  // Connector from last linear stage to fork stem
  const stemC = onAccepted || onRejected ? P : linIdx === LINEAR.length - 1 ? A : F;

  const forkDot = (active: boolean, size = 9) => ({
    width: active ? 13 : size, height: active ? 13 : size, borderRadius: "50%",
    background: active ? A : F, flexShrink: 0 as const, transition: "all 0.2s",
    border: active ? `2px solid ${A}` : "none",
    boxShadow: active ? `0 0 0 3px var(--accent-15)` : "none",
    display: "flex", alignItems: "center", justifyContent: "center",
  });

  return (
    <div style={{ padding: "12px 0 8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>

        {/* ── Linear stages ── */}
        {LINEAR.map((s, i) => {
          const active = stage === s.id;
          const past   = i < linIdx || inFork;
          const dc     = active ? A : past ? P : F;
          return (
            <div key={s.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: i === 0 ? "flex-start" : "center", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                {i > 0 && <div style={{ flex: 1, height: 2, background: lineC(i), transition: "background 0.2s" }} />}
                <div style={{
                  width: active ? 13 : 9, height: active ? 13 : 9, borderRadius: "50%",
                  background: dc, flexShrink: 0, transition: "all 0.2s",
                  border: active ? `2px solid ${A}` : "none",
                  boxShadow: active ? `0 0 0 3px var(--accent-15)` : "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: past ? 0.55 : 1,
                }}>
                  {past && <Check width={5} height={5} color="var(--bg)" strokeWidth={3} />}
                </div>
                {/* After-dot line or fork connector for last stage */}
                {i < LINEAR.length - 1
                  ? <div style={{ flex: 1, height: 2, background: lineC(i + 1), transition: "background 0.2s" }} />
                  : <div style={{ width: 14, height: 2, background: stemC, transition: "background 0.2s", flexShrink: 0 }} />
                }
              </div>
              <div style={{
                fontSize: 9, fontWeight: active ? 700 : 500,
                color: active ? A : "var(--fg-3)", whiteSpace: "nowrap",
                opacity: past ? 0.55 : 1,
              }}>{s.short}</div>
            </div>
          );
        })}

        {/* ── Fork junction: vertical stem + two outcome branches ── */}
        <div style={{ display: "flex", flexDirection: "column", position: "relative", flexShrink: 0 }}>
          {/* Vertical stem spanning both branches */}
          <div style={{
            position: "absolute", left: 0, top: "20%", bottom: "20%",
            width: 2, background: stemC, transition: "background 0.2s",
          }} />

          {/* Top branch: Contract offer (= accepted) */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, paddingLeft: 2, paddingBottom: 5 }}>
            <div style={{ width: 10, height: 2, background: onAccepted ? P : F }} />
            <div style={forkDot(onAccepted)} />
            <span style={{ fontSize: 9, fontWeight: onAccepted ? 700 : 500, color: onAccepted ? A : "var(--fg-3)", whiteSpace: "nowrap" }}>
              Contract offer
            </span>
          </div>

          {/* Bottom branch: Rejected */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, paddingLeft: 2, paddingTop: 5 }}>
            <div style={{ width: 10, height: 2, background: onRejected ? P : F }} />
            <div style={forkDot(onRejected)} />
            <span style={{ fontSize: 9, fontWeight: onRejected ? 700 : 500, color: onRejected ? A : "var(--fg-3)", whiteSpace: "nowrap" }}>
              Rejected
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Logo Avatar (header) ─────────────────────────────────────
function LogoAvatar({ company, logoUrl, size = 44 }: { company: string; logoUrl?: string | null; size?: number }) {
  const [imgOk, setImgOk] = useState(false);
  const color = getCompanyColor(company);
  return (
    <div style={{
      width: size, height: size, borderRadius: 10, flexShrink: 0,
      background: imgOk ? "#fff" : color,
      border: imgOk ? "1px solid var(--border)" : "none",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.4, fontWeight: 700, color: "#fff",
      overflow: "hidden", padding: imgOk ? 4 : 0, boxSizing: "border-box"
    }}>
      {logoUrl && (
        <img src={logoUrl} alt="" onLoad={() => setImgOk(true)} onError={() => setImgOk(false)}
          style={{ display: imgOk ? "block" : "none", width: "100%", height: "100%", objectFit: "contain" }} />
      )}
      {!imgOk && company.slice(0, 2).toUpperCase()}
    </div>
  );
}

// ─── Overview Tab ──────────────────────────────────────────────
function OverviewTab({ app, stage, url, onUrlChange, onSave }: {
  app: Application; stage: string;
  url: string; onUrlChange: (url: string) => void;
  onSave: (patch: Partial<Application>) => void
}) {
  const [company, setCompany] = useState(app.company);
  const [role, setRole]       = useState(app.role);
  const [location, setLocation] = useState(app.location ?? "");
  const [salary, setSalary]   = useState(app.salary ?? "");
  const [tags, setTags]       = useState<string[]>(parseTags(app.tags));
  const [newTag, setNewTag]   = useState("");
  const [saved, setSaved]     = useState(false);

  const save = useCallback((patch: Partial<Application>) => {
    onSave(patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [onSave]);

  const addTag = (t: string) => {
    const tag = t.trim(); if (!tag || tags.includes(tag)) { setNewTag(""); return; }
    const next = [...tags, tag]; setTags(next); setNewTag("");
    save({ tags: JSON.stringify(next) });
  };
  const removeTag = (t: string) => { const next = tags.filter((x) => x !== t); setTags(next); save({ tags: JSON.stringify(next) }); };

  const daysInStage    = daysAgo(app.updatedAt);
  const daysSinceApplied = app.appliedAt ? daysAgo(app.appliedAt) : null;

  return (
    <>
      {/* Compact stats */}
      <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
        {[
          { label: "In Stage", value: <span className="mono" style={{ fontSize: 15, fontWeight: 700 }}>{daysInStage}<span style={{ fontSize: 11, color: "var(--fg-3)", marginLeft: 1 }}>d</span></span> },
          { label: "Applied",  value: <span className="mono" style={{ fontSize: 15, fontWeight: 700 }}>{daysSinceApplied != null ? <>{daysSinceApplied}<span style={{ fontSize: 11, color: "var(--fg-3)", marginLeft: 1 }}>d</span></> : "—"}</span> },
          { label: "Salary",   value: <span style={{ fontSize: 13, fontWeight: 600 }}>{app.salary || "—"}</span> },
          { label: "Deadline", value: <span style={{ fontSize: 13, fontWeight: 600 }}>{app.nextDeadline || "—"}</span> },
        ].map(({ label, value }) => (
          <div key={label} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
            <div style={{ color: "var(--fg-1)", lineHeight: 1.2 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Fields */}
      {/* Row 1: Firma + Ort */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field">
          <label>Firma</label>
          <input value={company} onChange={(e) => setCompany(e.target.value)} onBlur={() => save({ company })} />
        </div>
        <div className="field">
          <label>Ort</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} onBlur={() => save({ location })} />
        </div>
      </div>

      {/* Row 2: Rolle (full width) */}
      <div className="field">
        <label>Rolle</label>
        <input value={role} onChange={(e) => setRole(e.target.value)} onBlur={() => save({ role })} />
      </div>

      {/* Row 3: Original URL + Bewerbungsportal */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field">
          <label>Original URL</label>
          <div style={{ position: "relative" }}>
            <Link width={12} height={12} style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", color: "var(--fg-3)", pointerEvents: "none" }} />
            <input value={url} onChange={(e) => onUrlChange(e.target.value)} onBlur={() => save({ url })}
              placeholder="https://…" style={{ paddingLeft: 18, paddingRight: url ? 20 : undefined }} />
            {url && <a href={url} target="_blank" rel="noreferrer" style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", color: "var(--accent)", display: "flex" }}><OpenNewWindow width={12} height={12} /></a>}
          </div>
        </div>
        <div className="field">
          <label>Bewerbungsportal</label>
          <div style={{ position: "relative" }}>
            <OpenNewWindow width={12} height={12} style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", color: "var(--fg-3)", pointerEvents: "none" }} />
            <input value={app.portalUrl ?? ""} onChange={(e) => save({ portalUrl: e.target.value })} onBlur={(e) => save({ portalUrl: e.target.value })}
              placeholder="https://apply.firma.com/…" style={{ paddingLeft: 18, paddingRight: app.portalUrl ? 20 : undefined }} />
            {app.portalUrl && <a href={app.portalUrl} target="_blank" rel="noreferrer" style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", color: "var(--accent)", display: "flex" }}><OpenNewWindow width={12} height={12} /></a>}
          </div>
        </div>
      </div>

      {/* Row 4: Salary + Nächster Schritt */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field">
          <label>Salary</label>
          <input value={salary} onChange={(e) => setSalary(e.target.value)} onBlur={() => save({ salary })} placeholder="e.g. €80–100k" />
        </div>
        <div className="field">
          <label>Nächster Schritt</label>
          <input value={app.nextDeadline ?? ""} onChange={(e) => save({ nextDeadline: e.target.value })} placeholder="z.B. Interview 15. Mai" />
        </div>
      </div>

      {/* Tags */}
      <div className="field">
        <label>Tags</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", minHeight: 38 }}>
          {tags.map((t) => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: "var(--accent-08)", color: "var(--accent)", fontSize: 11, fontWeight: 600, border: "1px solid var(--accent-15)" }}>
              {t}<button onClick={() => removeTag(t)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, lineHeight: 1, fontSize: 13 }}>×</button>
            </span>
          ))}
          <input value={newTag} onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(newTag); } }}
            placeholder={tags.length === 0 ? "Add tags…" : ""} style={{ border: "none", background: "transparent", color: "var(--fg-1)", fontSize: 12, outline: "none", minWidth: 80, flex: 1 }} />
        </div>
      </div>

      <div className="autosave-indicator">
        <span className="dot" style={{ background: saved ? "var(--accent)" : "var(--green)" }} />
        {saved ? "Gespeichert." : "Änderungen werden automatisch gespeichert."}
      </div>
    </>
  );
}

// ─── Description Tab ──────────────────────────────────────────
function DescriptionTab({ app, onSave }: { app: Application; onSave: (patch: Partial<Application>) => void }) {
  const [description, setDescription] = useState(app.description ?? "");
  const [saved, setSaved] = useState(false);
  const save = () => { onSave({ description }); setSaved(true); setTimeout(() => setSaved(false), 1500); };
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "var(--fg-3)" }}>Originale Stellenbeschreibung</div>
        {app.url && (
          <a href={app.url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--accent)", fontSize: 11, fontWeight: 600, textDecoration: "none" }}>
            <OpenNewWindow width={11} height={11} /> Original öffnen
          </a>
        )}
      </div>
      <div className="field">
        <AutoTextarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={save}
          placeholder="Originale Stellenbeschreibung einfügen…" minRows={12} />
      </div>
      <div className="autosave-indicator">
        <span className="dot" style={{ background: saved ? "var(--accent)" : "var(--green)" }} />
        {saved ? "Gespeichert." : "Wird beim Verlassen des Felds gespeichert."}
      </div>
    </>
  );
}

// ─── Details Tab (Übersicht + Beschreibung) ───────────────────
const AI_RESULT_LABELS: Record<string, string> = {
  "glassdoor-check": "Glassdoor Rating",
  "kununu-check": "Kununu Rating",
  "linkedin-profile": "LinkedIn Firmenprofil",
  "salary-check": "Gehalts-Check Schweiz",
  "ats-keywords": "ATS-Keywords",
  "cv-highlights": "CV-Highlights",
  "interview-prep": "Interview-Vorbereitung",
  "salary-tips": "Gehaltsverhandlung",
  "company-research": "Unternehmensrecherche",
  "ackermann-script": "Ackermann-Script",
  "letter-review": "Anschreiben-Review",
  "opening-sentences": "Eröffnungssätze",
  "onboarding": "Onboarding-Checkliste",
};

function aiResultSummary(id: string, data: unknown): string {
  if (!data) return "";
  const d = data as Record<string, unknown>;
  switch (id) {
    case "glassdoor-check": {
      const rating = d.rating as number | null;
      const summary = (d.summary as string | undefined) ?? "";
      return rating != null ? `★ ${rating} · ${summary.slice(0, 70)}` : summary.slice(0, 80);
    }
    case "kununu-check": {
      const rating = d.rating as number | null;
      const summary = (d.summary as string | undefined) ?? "";
      return rating != null ? `★ ${rating} · ${summary.slice(0, 70)}` : summary.slice(0, 80);
    }
    case "linkedin-profile": {
      const emp = (d.employeeCount as string | undefined);
      const desc = (d.description as string | undefined) ?? "";
      return emp ? `${emp} Mitarbeitende · ${desc.slice(0, 50)}` : desc.slice(0, 80);
    }
    case "salary-check": {
      const lb = d.lohnband as { min?: number; max?: number; median?: number } | undefined;
      const w = (d.waehrung as string | undefined) ?? "CHF";
      if (!lb) return (d.begruendung as string | undefined ?? "").slice(0, 80);
      return `${w} ${lb.min?.toLocaleString("de-CH")}–${lb.max?.toLocaleString("de-CH")} · Median ${lb.median?.toLocaleString("de-CH")}`;
    }
    case "ats-keywords": {
      const kws = [...((d.mustHave as string[]) ?? [])].slice(0, 6).join(" · ");
      return kws + ((d.mustHave as string[] | undefined ?? []).length > 6 ? " …" : "");
    }
    case "cv-highlights": {
      const h = (d.highlights as string[] | undefined ?? []).length;
      const k = (d.keywords as string[] | undefined ?? []).length;
      return `${h} Stärken · ${k} Keywords`;
    }
    case "interview-prep": {
      const q = (d.rollenFragen as string[] | undefined ?? []).length;
      const s = (d.starBeispiele as unknown[] | undefined ?? []).length;
      const v = (d.vossFragenWhatHow as string[] | undefined ?? []).length;
      return `${q} Fragen · ${s} STAR · ${v} Voss`;
    }
    case "salary-tips":
      return ((d["markteinschätzung"] as string | undefined) ?? "").slice(0, 80);
    case "company-research":
      return ((d.unternehmensueberblick as string | undefined) ?? "").slice(0, 80);
    case "ackermann-script": {
      const steps = (d.schritte as unknown[] | undefined ?? []).length;
      return `${steps} Verhandlungsschritte`;
    }
    case "letter-review":
      return ((d.gesamteindruck as string | undefined) ?? "").slice(0, 80);
    case "opening-sentences":
      return `${(d.saetze as unknown[] | undefined ?? []).length} Eröffnungssätze generiert`;
    case "onboarding": {
      const total = (d.erste30Tage as unknown[] | undefined ?? []).length
        + (d.erste60Tage as unknown[] | undefined ?? []).length
        + (d.erste90Tage as unknown[] | undefined ?? []).length;
      return `${total} Punkte · 30/60/90 Tage`;
    }
    default: return "";
  }
}

// ─── AiResultCard Helpers ────────────────────────────────────
const TagBadge = ({ text, color }: { text: string; color?: string }) => (
  <span style={{
    display: "inline-block", padding: "2px 8px", borderRadius: 4, margin: "2px 3px 2px 0",
    background: color ? `${color}18` : "var(--surface-2)",
    border: `1px solid ${color ? `${color}44` : "var(--border)"}`,
    fontSize: 10, color: color ?? "var(--fg-2)", lineHeight: 1.5,
  }}>{text}</span>
);

const AiSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{title}</div>
    {children}
  </div>
);

const BulletList = ({ items, accent }: { items: string[]; accent?: string }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
    {items.map((item, i) => (
      <div key={i} style={{ fontSize: 11, color: "var(--fg-1)", display: "flex", gap: 6, alignItems: "flex-start" }}>
        <span style={{ color: accent ?? "var(--fg-3)", flexShrink: 0 }}>•</span>
        <span style={{ lineHeight: 1.5 }}>{item}</span>
      </div>
    ))}
  </div>
);

function GlassdoorCardDetail({ data, appId, onUpdate }: {
  data: GlassdoorData; appId: string; onUpdate: (v: GlassdoorData) => void;
}) {
  const [editUrl, setEditUrl] = useState(data.glassdoorUrl ?? "");
  const [saving,  setSaving]  = useState(false);
  const stars = data.rating ? "★".repeat(Math.round(data.rating)) + "☆".repeat(5 - Math.round(data.rating)) : null;
  const confidenceColor = data.confidence === "hoch" ? "#34d399" : data.confidence === "mittel" ? "#fbbf24" : "#f87171";

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.patch<GlassdoorData>(`/api/applications/${appId}/ai/glassdoor-check`, { glassdoorUrl: editUrl || undefined });
      onUpdate(r.data);
    } finally { setSaving(false); }
  };

  return (
    <>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 100, padding: "10px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "var(--fg-3)", marginBottom: 3 }}>GLASSDOOR</div>
          {data.rating != null
            ? <><div style={{ fontSize: 24, fontWeight: 800, color: "var(--accent)", lineHeight: 1 }}>{data.rating.toFixed(1)}</div>
               <div style={{ fontSize: 10, color: "#fbbf24", marginTop: 2 }}>{stars}</div>
               {data.reviewCount && <div style={{ fontSize: 9, color: "var(--fg-3)", marginTop: 2 }}>~{data.reviewCount} Reviews</div>}</>
            : <div style={{ fontSize: 11, color: "var(--fg-3)" }}>—</div>}
        </div>
        {(data.ceoApproval != null || data.recommendToFriend != null) && (
          <div style={{ flex: 1, minWidth: 100, padding: "10px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            {data.ceoApproval != null && <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: "var(--fg-3)", marginBottom: 2 }}>CEO-ZUSTIMMUNG</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg-1)" }}>{data.ceoApproval}%</div>
            </div>}
            {data.recommendToFriend != null && <div>
              <div style={{ fontSize: 9, color: "var(--fg-3)", marginBottom: 2 }}>EMPFEHLEN</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg-1)" }}>{data.recommendToFriend}%</div>
            </div>}
          </div>
        )}
      </div>
      {data.summary && <div style={{ fontSize: 11, color: "var(--fg-2)", lineHeight: 1.6, marginBottom: 10 }}>{data.summary}</div>}
      {(data.pros?.length > 0 || data.cons?.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          {data.pros?.length > 0 && <AiSection title="Positiv"><BulletList items={data.pros} accent="#34d399" /></AiSection>}
          {data.cons?.length > 0 && <AiSection title="Kritisch"><BulletList items={data.cons} accent="#f87171" /></AiSection>}
        </div>
      )}
      {/* Editierbarer Glassdoor-Link */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 9, color: "var(--fg-3)", marginBottom: 4 }}>GLASSDOOR-LINK</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="url" value={editUrl} onChange={e => setEditUrl(e.target.value)}
            placeholder="https://www.glassdoor.com/..."
            style={{ flex: 1, background: "none", border: "none", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--fg-1)", outline: "none", padding: "3px 0", fontFamily: "var(--font-sans)" }} />
          {editUrl && (
            <a href={editUrl} target="_blank" rel="noopener noreferrer" title="Öffnen"
              style={{ display: "flex", alignItems: "center", color: "var(--fg-3)", padding: 3, borderRadius: 4, flexShrink: 0, textDecoration: "none" }}>
              <OpenNewWindow width={13} height={13} />
            </a>
          )}
          <button onClick={save} disabled={saving} title="URL speichern & aktualisieren"
            style={{ display: "flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", color: saving ? "var(--fg-4)" : "var(--fg-2)", padding: 3, borderRadius: 4, flexShrink: 0 }}>
            {saving ? <RefreshCircle width={13} height={13} style={{ animation: "spin 1s linear infinite" }} /> : <Refresh width={13} height={13} />}
          </button>
        </div>
      </div>
      <div style={{ fontSize: 10, color: "var(--fg-3)" }}>
        <span style={{ color: confidenceColor, fontWeight: 600 }}>Konfidenz: {data.confidence}</span>
        {data.hinweis && <span> · {data.hinweis}</span>}
      </div>
    </>
  );
}

function KununuCardDetail({ data }: { data: KununuData }) {
  const confidenceColor = data.confidence === "hoch" ? "#34d399" : data.confidence === "mittel" ? "#fbbf24" : "#f87171";
  return (
    <>
      {data.summary && <div style={{ fontSize: 11, color: "var(--fg-2)", lineHeight: 1.6, marginBottom: 12 }}>{data.summary}</div>}
      {data.url && (
        <a href={data.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: 10, gap: 4, textDecoration: "none", marginBottom: 12, display: "inline-flex" }}>
          <OpenNewWindow width={10} height={10} /> Kununu öffnen
        </a>
      )}
      <div style={{ fontSize: 10, color: "var(--fg-3)" }}>
        <span style={{ color: confidenceColor, fontWeight: 600 }}>Konfidenz: {data.confidence}</span>
        {data.hinweis && <span> · {data.hinweis}</span>}
      </div>
    </>
  );
}

function LinkedinCardDetail({ data, appId, onUpdate }: {
  data: LinkedinData; appId: string; onUpdate: (v: LinkedinData) => void;
}) {
  const [editUrl, setEditUrl] = useState(data.url ?? "");
  const [saving,  setSaving]  = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.patch<LinkedinData>(`/api/applications/${appId}/ai/linkedin-profile`, { url: editUrl });
      onUpdate(r.data);
    } finally { setSaving(false); }
  };

  return (
    <>
      {data.employeeCount && (
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, padding: "10px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "var(--fg-3)", marginBottom: 3 }}>MITARBEITENDE</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--accent)" }}>{data.employeeCount}</div>
          </div>
        </div>
      )}
      {data.description && <div style={{ fontSize: 11, color: "var(--fg-2)", lineHeight: 1.6, marginBottom: 10 }}>{data.description}</div>}
      {data.url && (
        <a href={data.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: 10, gap: 4, textDecoration: "none", marginBottom: 12, display: "inline-flex" }}>
          <OpenNewWindow width={10} height={10} /> LinkedIn öffnen
        </a>
      )}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", marginBottom: 8 }}>URL aktualisieren</div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: "var(--fg-3)", marginBottom: 3 }}>LinkedIn Unternehmens-URL</div>
          <input type="url" value={editUrl} onChange={e => setEditUrl(e.target.value)} placeholder="https://www.linkedin.com/company/..."
            style={{ width: "100%", boxSizing: "border-box", background: "none", border: "none", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--fg-1)", outline: "none", padding: "2px 0", fontFamily: "var(--font-sans)" }} />
        </div>
        <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={save} disabled={saving}>
          {saving ? <RefreshCircle width={11} height={11} style={{ animation: "spin 1s linear infinite" }} /> : "Speichern"}
        </button>
        {data.hinweis && <div style={{ marginTop: 8, fontSize: 10, color: "var(--fg-3)" }}>{data.hinweis}</div>}
        {data.manuallyEdited && <div style={{ marginTop: 4, fontSize: 10, color: "var(--accent)" }}>· manuell bearbeitet</div>}
      </div>
    </>
  );
}

// ─── Salary Band Chart ────────────────────────────────────────
function SalaryBandChart({ min, max, median, desired, currency = "CHF" }: {
  min: number; max: number; median: number; desired?: number | null; currency?: string;
}) {
  const range = max - min;
  if (range <= 0) return null;
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / range) * 100)).toFixed(2)}%`;
  const fmt = (v: number) => `${currency} ${v.toLocaleString("de-CH")}`;
  const desiredPct = desired != null ? pct(desired) : null;
  const desiredInBand = desired != null && desired >= min && desired <= max;

  return (
    <div style={{ marginBottom: 16, userSelect: "none" }}>
      {/* Labels above markers */}
      <div style={{ position: "relative", height: 20, marginBottom: 2 }}>
        <div style={{ position: "absolute", left: pct(median), transform: "translateX(-50%)", fontSize: 9, color: "var(--accent)", fontWeight: 700, whiteSpace: "nowrap" }}>
          Median
        </div>
        {desiredPct && (
          <div style={{
            position: "absolute",
            left: desiredInBand ? desiredPct : desired! < min ? "0%" : "100%",
            transform: "translateX(-50%)",
            fontSize: 9, color: "#f59e0b", fontWeight: 700, whiteSpace: "nowrap",
          }}>
            Wunsch
          </div>
        )}
      </div>

      {/* Band bar */}
      <div style={{ position: "relative", height: 26, borderRadius: 6, background: "var(--surface-2)", border: "1px solid var(--border)", overflow: "hidden" }}>
        {/* Band fill */}
        <div style={{ position: "absolute", inset: 0, background: "var(--accent)", opacity: 0.18 }} />
        {/* Median marker */}
        <div style={{ position: "absolute", left: pct(median), top: 0, bottom: 0, width: 2, background: "var(--accent)", transform: "translateX(-50%)" }} />
        {/* Desired salary marker */}
        {desiredInBand && desiredPct && (
          <div style={{ position: "absolute", left: desiredPct, top: 0, bottom: 0, width: 2, background: "#f59e0b", transform: "translateX(-50%)" }} />
        )}
      </div>

      {/* Min / Median / Max labels */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 9, color: "var(--fg-3)" }}>
        <span>{fmt(min)}</span>
        <span style={{ color: "var(--accent)", fontWeight: 600 }}>{fmt(median)}</span>
        <span>{fmt(max)}</span>
      </div>

      {/* Desired salary annotation */}
      {desired != null && (
        <div style={{ marginTop: 6, fontSize: 10, color: "#f59e0b", fontWeight: 500 }}>
          Wunschgehalt: {fmt(desired)}
          {desiredInBand && ` · ${desired <= median ? "unter" : "über"} Median`}
          {!desiredInBand && (desired < min ? " · unter Bandminimum" : " · über Bandmaximum")}
        </div>
      )}
    </div>
  );
}

// Salary-check expanded detail — fetches profile for desired salary
function SalaryCheckDetail({ data, appId }: { data: SalaryCheck; appId: string }) {
  const { data: profile } = useQuery<{ desiredSalary?: string | null }>({
    queryKey: ["profile"],
    queryFn: () => api.get("/api/profile").then(r => r.data),
  });
  const sc = data;
  const lb = sc.lohnband;
  const desired = profile?.desiredSalary
    ? parseInt(profile.desiredSalary.replace(/[^0-9]/g, ""), 10) || null : null;

  return (
    <>
      {/* Salary Band Chart */}
      {lb && <SalaryBandChart min={lb.min} max={lb.max} median={lb.median} desired={desired} currency={sc.waehrung ?? "CHF"} />}

      {/* Min / Median / Max tiles */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {([
          { label: "MINIMUM", val: lb?.min,    color: "#94a3b8" },
          { label: "MEDIAN",  val: lb?.median, color: "var(--accent)" },
          { label: "MAXIMUM", val: lb?.max,    color: "#34d399" },
        ] as const).map(({ label, val, color }) => (
          <div key={label} style={{ flex: 1, minWidth: 80, padding: "10px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "var(--fg-3)", marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val != null ? `${sc.waehrung ?? "CHF"} ${val.toLocaleString("de-CH")}` : "—"}</div>
            <div style={{ fontSize: 9, color: "var(--fg-3)" }}>{sc.basis ?? "p.a."}</div>
          </div>
        ))}
      </div>
      {sc.begruendung && <AiSection title="Begründung"><div style={{ fontSize: 11, color: "var(--fg-2)", lineHeight: 1.6 }}>{sc.begruendung}</div></AiSection>}
      {sc.faktoren?.length > 0 && <AiSection title="Einflussfaktoren"><div>{sc.faktoren.map((f, i) => <TagBadge key={i} text={f} />)}</div></AiSection>}
    </>
  );
}

function AiResultDetail({ id, data, appId, onUpdate }: {
  id: string; data: unknown; appId: string; onUpdate?: (id: string, data: unknown) => void;
}) {
  if (id === "glassdoor-check") {
    return <GlassdoorCardDetail data={data as GlassdoorData} appId={appId} onUpdate={v => onUpdate?.(id, v)} />;
  }
  if (id === "kununu-check") {
    return <KununuCardDetail data={data as KununuData} />;
  }
  if (id === "linkedin-profile") {
    return <LinkedinCardDetail data={data as LinkedinData} appId={appId} onUpdate={v => onUpdate?.(id, v)} />;
  }
  if (id === "salary-check") {
    return <SalaryCheckDetail data={data as SalaryCheck} appId={appId} />;
  }
  if (id === "ats-keywords") {
    const kw = data as AtsKeywords;
    return (
      <>
        {kw.mustHave?.length > 0    && <AiSection title="Must Have">{kw.mustHave.map((k, i)    => <TagBadge key={i} text={k} color="var(--accent)" />)}</AiSection>}
        {kw.niceToHave?.length > 0  && <AiSection title="Nice to Have">{kw.niceToHave.map((k, i)  => <TagBadge key={i} text={k} />)}</AiSection>}
        {kw.softSkills?.length > 0  && <AiSection title="Soft Skills">{kw.softSkills.map((k, i)  => <TagBadge key={i} text={k} color="#a78bfa" />)}</AiSection>}
        {kw.tools?.length > 0       && <AiSection title="Tools & Technologien">{kw.tools.map((k, i)       => <TagBadge key={i} text={k} color="#34d399" />)}</AiSection>}
      </>
    );
  }
  if (id === "cv-highlights") {
    const cv = data as CvHighlights;
    return (
      <>
        {cv.highlights?.length > 0 && <AiSection title="Relevante Stärken"><BulletList items={cv.highlights} accent="#34d399" /></AiSection>}
        {cv.keywords?.length > 0   && <AiSection title="Keywords">{cv.keywords.map((k, i) => <TagBadge key={i} text={k} />)}</AiSection>}
        {cv.gaps?.length > 0       && <AiSection title="Lücken"><BulletList items={cv.gaps} accent="#f87171" /></AiSection>}
      </>
    );
  }
  if (id === "interview-prep") {
    const iv = data as InterviewPrep;
    return (
      <>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {([
            { label: "FRAGEN",    val: iv.rollenFragen?.length ?? 0,      color: "var(--accent)" },
            { label: "STAR",      val: iv.starBeispiele?.length ?? 0,     color: "#34d399" },
            { label: "VOSS",      val: iv.vossFragenWhatHow?.length ?? 0, color: "#fbbf24" },
            { label: "RÜCKFRAGEN",val: iv.rueckfragen?.length ?? 0,       color: "#a78bfa" },
          ]).map(({ label, val, color }) => (
            <div key={label} style={{ flex: 1, minWidth: 70, padding: "10px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "var(--fg-3)", marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{val}</div>
            </div>
          ))}
        </div>
        {iv.rollenFragen?.slice(0, 3).map((q, i) => (
          <div key={i} style={{ fontSize: 11, color: "var(--fg-2)", padding: "5px 0", borderBottom: i < 2 ? "1px solid var(--border)" : "none", lineHeight: 1.5 }}>{i + 1}. {q}</div>
        ))}
        {(iv.rollenFragen?.length ?? 0) > 3 && <div style={{ fontSize: 10, color: "var(--fg-3)", marginTop: 6 }}>+{(iv.rollenFragen?.length ?? 0) - 3} weitere Fragen im Aktionen-Tab</div>}
      </>
    );
  }
  if (id === "salary-tips") {
    const st = data as SalaryTips;
    return (
      <>
        {(st["markteinschätzung"] as string | undefined) && <AiSection title="Markteinschätzung"><div style={{ fontSize: 11, color: "var(--fg-2)", lineHeight: 1.6 }}>{st["markteinschätzung"] as string}</div></AiSection>}
        {st.taktiken?.length > 0     && <AiSection title="Taktiken"><BulletList items={st.taktiken} accent="var(--accent)" /></AiSection>}
        {st.vossAnker               && <AiSection title="Voss-Anker"><div style={{ fontSize: 11, color: "var(--fg-2)", fontStyle: "italic", lineHeight: 1.6, padding: "6px 10px", borderLeft: "3px solid var(--accent)", background: "var(--surface-2)", borderRadius: "0 6px 6px 0" }}>„{st.vossAnker}"</div></AiSection>}
      </>
    );
  }
  if (id === "company-research") {
    const cr = data as CompanyResearch;
    return (
      <>
        {cr.unternehmensueberblick && <AiSection title="Überblick"><div style={{ fontSize: 11, color: "var(--fg-2)", lineHeight: 1.6 }}>{cr.unternehmensueberblick}</div></AiSection>}
        {cr.unternehmenskultur     && <AiSection title="Kultur"><div style={{ fontSize: 11, color: "var(--fg-2)", lineHeight: 1.6 }}>{cr.unternehmenskultur}</div></AiSection>}
        {cr.marktposition          && <AiSection title="Marktposition"><div style={{ fontSize: 11, color: "var(--fg-2)", lineHeight: 1.6 }}>{cr.marktposition}</div></AiSection>}
        {cr.wettbewerber?.length > 0  && <AiSection title="Wettbewerber">{cr.wettbewerber.map((w, i) => <TagBadge key={i} text={w} />)}</AiSection>}
        {cr.aktuelleThemen?.length > 0 && <AiSection title="Aktuelle Themen"><BulletList items={cr.aktuelleThemen} /></AiSection>}
      </>
    );
  }
  if (id === "ackermann-script") {
    const as_ = data as AckermannScript;
    return (
      <>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1, padding: "10px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "var(--fg-3)", marginBottom: 3 }}>ZIELGEHALT</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--accent)" }}>{as_.zielgehalt?.toLocaleString("de-CH")}</div>
          </div>
          <div style={{ flex: 1, padding: "10px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "var(--fg-3)", marginBottom: 3 }}>ANKERGEBOT</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#34d399" }}>{as_.ankergebot?.toLocaleString("de-CH")}</div>
          </div>
        </div>
        {as_.schritte?.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--fg-3)", minWidth: 22, flexShrink: 0, paddingTop: 2 }}>R{s.runde}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>{s.angebot?.toLocaleString("de-CH")}</div>
              <div style={{ fontSize: 11, color: "var(--fg-2)", marginTop: 2, lineHeight: 1.5 }}>{s.formulierung}</div>
            </div>
          </div>
        ))}
        {as_.nichtmonetaer?.length > 0 && <div style={{ marginTop: 12 }}><AiSection title="Nicht-monetäre Punkte"><div>{as_.nichtmonetaer.map((n, i) => <TagBadge key={i} text={n} />)}</div></AiSection></div>}
      </>
    );
  }
  if (id === "letter-review") {
    const lr = data as LetterReview;
    return (
      <>
        {lr.gesamteindruck && <AiSection title="Gesamteindruck"><div style={{ fontSize: 11, color: "var(--fg-2)", lineHeight: 1.6 }}>{lr.gesamteindruck}</div></AiSection>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          {lr.staerken?.length > 0      && <AiSection title="Stärken"><BulletList items={lr.staerken} accent="#34d399" /></AiSection>}
          {lr.verbesserungen?.length > 0 && <AiSection title="Verbesserungen"><BulletList items={lr.verbesserungen} accent="#fbbf24" /></AiSection>}
        </div>
        {lr.cliches?.length > 0 && <AiSection title="Clichés"><div>{lr.cliches.map((c, i) => <TagBadge key={i} text={c} color="#f87171" />)}</div></AiSection>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 10, color: "var(--fg-3)" }}>
          {lr.tonalitaet     && <span>Ton: <strong style={{ color: "var(--fg-2)" }}>{lr.tonalitaet}</strong></span>}
          {lr.laenge         && <span>· Länge: <strong style={{ color: "var(--fg-2)" }}>{lr.laenge}</strong></span>}
          {lr.personalisierung && <span>· Personalisierung: <strong style={{ color: "var(--fg-2)" }}>{lr.personalisierung}</strong></span>}
        </div>
      </>
    );
  }
  if (id === "opening-sentences") {
    const os = data as OpeningSentences;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {os.saetze?.map((s, i) => (
          <div key={i} style={{ padding: "10px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, fontStyle: "italic", color: "var(--fg-1)", lineHeight: 1.6, marginBottom: 4 }}>„{s.satz}"</div>
            <div style={{ fontSize: 9, color: "var(--accent)", fontWeight: 700, textTransform: "uppercase" }}>{s.ansatz}</div>
            {s.erklaerung && <div style={{ fontSize: 10, color: "var(--fg-3)", marginTop: 2, lineHeight: 1.4 }}>{s.erklaerung}</div>}
          </div>
        ))}
      </div>
    );
  }
  if (id === "onboarding") {
    const oc = data as OnboardingChecklist;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {([
          { label: "Erste 30 Tage", items: oc.erste30Tage, color: "var(--accent)" },
          { label: "Erste 60 Tage", items: oc.erste60Tage, color: "#fbbf24" },
          { label: "Erste 90 Tage", items: oc.erste90Tage, color: "#34d399" },
        ]).map(({ label, items, color }) => items?.length > 0 && (
          <div key={label}>
            <div style={{ fontSize: 9, fontWeight: 700, color, textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
            <BulletList items={items} accent={color} />
          </div>
        ))}
      </div>
    );
  }
  return null;
}

// IDs die die doppelte Kachelbreite benötigen (textintensiver Inhalt)
const DOUBLE_WIDTH_IDS = new Set([
  "salary-check", "ats-keywords", "company-research",
  "salary-tips", "letter-review", "opening-sentences",
]);

function renderTileContent(id: string, data: unknown): React.ReactNode {
  const d = data as Record<string, unknown>;

  if (id === "glassdoor-check" || id === "kununu-check") {
    const rating = d.rating as number | null;
    const stars  = rating != null ? "★".repeat(Math.round(rating)) + "☆".repeat(5 - Math.round(rating)) : null;
    const reviews = d.reviewCount as number | null;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: "100%" }}>
        <span style={{ fontSize: 44, fontWeight: 800, color: "var(--fg-2)", lineHeight: 1, letterSpacing: "-0.03em", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
          {rating != null ? rating.toFixed(1) : "—"}
        </span>
        {stars && <span style={{ fontSize: 14, color: "#4ade80", lineHeight: 1, letterSpacing: 2 }}>{stars}</span>}
        {reviews && <span style={{ fontSize: 9, color: "var(--fg-4)", marginTop: 2 }}>~{reviews} Reviews</span>}
      </div>
    );
  }
  if (id === "linkedin-profile") {
    const emp = d.employeeCount as string | undefined;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {emp && <span style={{ fontSize: 14, fontWeight: 800, color: "var(--accent)" }}>{emp}</span>}
        <span style={{ fontSize: 9, color: "var(--fg-4)" }}>Mitarbeitende</span>
      </div>
    );
  }
  if (id === "salary-check") {
    const lb = d.lohnband as { min?: number; max?: number; median?: number } | undefined;
    const w  = (d.waehrung as string | undefined) ?? "CHF";
    if (!lb) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "var(--fg-1)", letterSpacing: "-0.02em" }}>
          {w} {lb.min?.toLocaleString("de-CH")} – {lb.max?.toLocaleString("de-CH")}
        </span>
        <span style={{ fontSize: 10, color: "var(--fg-3)" }}>Median {lb.median?.toLocaleString("de-CH")}</span>
      </div>
    );
  }
  if (id === "ats-keywords") {
    const kws = (d.mustHave as string[] | undefined) ?? [];
    return (
      <div style={{ lineHeight: 1.8 }}>
        {kws.slice(0, 5).map((k, i) => (
          <span key={i} style={{
            display: "inline-block", padding: "1px 7px", borderRadius: 3,
            marginRight: 4, fontSize: 10, fontWeight: 600,
            background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--accent)",
          }}>{k}</span>
        ))}
        {kws.length > 5 && <span style={{ fontSize: 9, color: "var(--fg-4)" }}>+{kws.length - 5}</span>}
      </div>
    );
  }
  if (id === "cv-highlights") {
    const h = (d.highlights as string[] | undefined ?? []).length;
    const k = (d.keywords as string[] | undefined ?? []).length;
    return (
      <div style={{ display: "flex", gap: 14 }}>
        {[{ val: h, label: "Stärken", color: "#34d399" }, { val: k, label: "Keywords", color: "var(--accent)" }].map(({ val, label, color }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{val}</div>
            <div style={{ fontSize: 8, color: "var(--fg-4)", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
    );
  }
  if (id === "interview-prep") {
    const q = (d.rollenFragen as string[] | undefined ?? []).length;
    const s = (d.starBeispiele as unknown[] | undefined ?? []).length;
    const v = (d.vossFragenWhatHow as string[] | undefined ?? []).length;
    return (
      <div style={{ display: "flex", gap: 10 }}>
        {[{ val: q, label: "Fragen", color: "var(--accent)" }, { val: s, label: "STAR", color: "#34d399" }, { val: v, label: "Voss", color: "#fbbf24" }].map(({ val, label, color }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{val}</div>
            <div style={{ fontSize: 8, color: "var(--fg-4)", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
    );
  }
  if (id === "ackermann-script") {
    const ziel  = d.zielgehalt as number | undefined;
    const anker = d.ankergebot as number | undefined;
    return (
      <div style={{ display: "flex", gap: 14 }}>
        {[{ val: ziel, label: "Ziel", color: "var(--accent)" }, { val: anker, label: "Anker", color: "#34d399" }].map(({ val, label, color }) => (
          <div key={label}>
            <div style={{ fontSize: 13, fontWeight: 800, color, lineHeight: 1 }}>{val?.toLocaleString("de-CH") ?? "—"}</div>
            <div style={{ fontSize: 8, color: "var(--fg-4)", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
    );
  }
  if (id === "onboarding") {
    const t = (d.erste30Tage as string[] | undefined ?? []).length +
              (d.erste60Tage as string[] | undefined ?? []).length +
              (d.erste90Tage as string[] | undefined ?? []).length;
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: "var(--accent)", lineHeight: 1 }}>{t}</div>
        <div style={{ fontSize: 9, color: "var(--fg-4)", marginTop: 2 }}>Punkte</div>
      </div>
    );
  }
  // Doppelbreite Text-Kacheln — kurz abgeschnitten
  const textMap: Record<string, string> = {
    "salary-tips":      (d["markteinschätzung"] as string | undefined) ?? "",
    "company-research": (d.unternehmensueberblick as string | undefined) ?? "",
    "letter-review":    (d.gesamteindruck as string | undefined) ?? "",
  };
  if (id in textMap) {
    const text = textMap[id].slice(0, 100);
    return <span style={{ fontSize: 10, color: "var(--fg-2)", lineHeight: 1.45 }}>{text}{textMap[id].length > 100 ? "…" : ""}</span>;
  }
  if (id === "opening-sentences") {
    const saetze = d.saetze as Array<{ satz: string }> | undefined;
    const raw = saetze?.[0]?.satz ?? "";
    const text = raw.slice(0, 95);
    return <span style={{ fontSize: 10, color: "var(--fg-2)", fontStyle: "italic", lineHeight: 1.45 }}>„{text}{raw.length > 95 ? "…" : ""}"</span>;
  }
  return null;
}

const TILE_EMPTY_LABELS: Record<string, string> = {
  "glassdoor-check":   "Bewertung ermitteln",
  "kununu-check":      "Bewertung ermitteln",
  "linkedin-profile":  "Profil ermitteln",
  "salary-check":      "Lohnband berechnen",
  "ats-keywords":      "Keywords extrahieren",
  "cv-highlights":     "CV analysieren",
  "interview-prep":    "Vorbereitung generieren",
  "company-research":  "Recherche starten",
  "ackermann-script":  "Script generieren",
  "letter-review":     "Review starten",
  "opening-sentences": "Sätze generieren",
  "onboarding":        "Checkliste erstellen",
  "salary-tips":       "Tipps generieren",
};

function AiResultTile({ id, entry, onExpand }: {
  id: string;
  entry: { data: unknown; createdAt: Date } | null;
  onExpand: () => void;
}) {
  const label    = AI_RESULT_LABELS[id] ?? id;
  const isDouble = DOUBLE_WIDTH_IDS.has(id);
  const content  = entry ? renderTileContent(id, entry.data) : null;
  const hasData  = !!content;

  return (
    <button onClick={onExpand} style={{
      gridColumn: isDouble ? "span 2" : undefined,
      position: "relative",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "12px 12px 14px", borderRadius: 12, minHeight: 120,
      border: "1px solid var(--border)", background: "var(--surface)",
      cursor: "pointer", fontFamily: "var(--font-sans)",
    }}>
      {/* Label zentriert oben */}
      <span style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 10, lineHeight: 1, textAlign: "center" }}>
        {label}
      </span>
      {/* Expand-Icon oben-rechts — immer sichtbar, Accent-Farbe */}
      <div style={{ position: "absolute", top: 8, right: 8, color: "var(--accent)", display: "flex" }}>
        <Expand width={13} height={13} />
      </div>
      {/* Hauptinhalt — mit oder ohne Daten */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", width: "100%", minHeight: 64 }}>
        {hasData ? (
          <div style={{ display: "flex", alignItems: isDouble ? "flex-start" : "center", justifyContent: "center", width: "100%" }}>
            {content}
          </div>
        ) : (
          <span style={{ fontSize: 12, color: "var(--fg-3)", fontWeight: 500, textAlign: "center", lineHeight: 1.4, padding: "0 4px" }}>
            {TILE_EMPTY_LABELS[id] ?? "Analyse starten"}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Large tile (2× scale) for expand right column ───────────
function renderTileContentLarge(id: string, data: unknown): React.ReactNode {
  const d = data as Record<string, unknown>;
  if (id === "glassdoor-check" || id === "kununu-check") {
    const rating  = d.rating as number | null;
    const stars   = rating != null ? "★".repeat(Math.round(rating)) + "☆".repeat(5 - Math.round(rating)) : null;
    const reviews = d.reviewCount as number | null;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: "100%" }}>
        <span style={{ fontSize: 72, fontWeight: 800, color: "var(--fg-2)", lineHeight: 1, letterSpacing: "-0.04em", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
          {rating != null ? rating.toFixed(1) : "—"}
        </span>
        {stars && <span style={{ fontSize: 22, color: "#4ade80", lineHeight: 1, letterSpacing: 3 }}>{stars}</span>}
        {reviews && <span style={{ fontSize: 12, color: "var(--fg-4)", marginTop: 2 }}>~{reviews} {id === "kununu-check" ? "Bewertungen" : "Reviews"}</span>}
      </div>
    );
  }
  if (id === "linkedin-profile") {
    const emp = d.employeeCount as string | undefined;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        {emp && <span style={{ fontSize: 26, fontWeight: 800, color: "var(--accent)" }}>{emp}</span>}
        <span style={{ fontSize: 13, color: "var(--fg-4)" }}>Mitarbeitende</span>
      </div>
    );
  }
  if (id === "salary-check") {
    const lb = d.lohnband as { min?: number; max?: number; median?: number } | undefined;
    const w  = (d.waehrung as string | undefined) ?? "CHF";
    if (!lb) return null;
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--fg-1)", letterSpacing: "-0.02em" }}>
          {w} {lb.min?.toLocaleString("de-CH")} – {lb.max?.toLocaleString("de-CH")}
        </div>
        <div style={{ fontSize: 14, color: "var(--fg-3)", marginTop: 4 }}>Median {lb.median?.toLocaleString("de-CH")}</div>
      </div>
    );
  }
  if (id === "cv-highlights") {
    const h = (d.highlights as string[] | undefined ?? []).length;
    const k = (d.keywords as string[] | undefined ?? []).length;
    return (
      <div style={{ display: "flex", gap: 24 }}>
        {[{ val: h, label: "Stärken", color: "#34d399" }, { val: k, label: "Keywords", color: "var(--accent)" }].map(({ val, label, color }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, fontWeight: 800, color, lineHeight: 1 }}>{val}</div>
            <div style={{ fontSize: 11, color: "var(--fg-4)", marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>
    );
  }
  if (id === "interview-prep") {
    const q = (d.rollenFragen as string[] | undefined ?? []).length;
    const s = (d.starBeispiele as unknown[] | undefined ?? []).length;
    const v = (d.vossFragenWhatHow as string[] | undefined ?? []).length;
    return (
      <div style={{ display: "flex", gap: 16 }}>
        {[{ val: q, label: "Fragen", color: "var(--accent)" }, { val: s, label: "STAR", color: "#34d399" }, { val: v, label: "Voss", color: "#fbbf24" }].map(({ val, label, color }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1 }}>{val}</div>
            <div style={{ fontSize: 10, color: "var(--fg-4)", marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>
    );
  }
  if (id === "onboarding") {
    const t = (d.erste30Tage as string[] | undefined ?? []).length +
              (d.erste60Tage as string[] | undefined ?? []).length +
              (d.erste90Tage as string[] | undefined ?? []).length;
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 56, fontWeight: 800, color: "var(--accent)", lineHeight: 1 }}>{t}</div>
        <div style={{ fontSize: 13, color: "var(--fg-4)", marginTop: 6 }}>Punkte</div>
      </div>
    );
  }
  if (id === "ackermann-script") {
    const ziel  = d.zielgehalt as number | undefined;
    const anker = d.ankergebot as number | undefined;
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--accent)", lineHeight: 1 }}>{ziel?.toLocaleString("de-CH") ?? "—"}</div>
        <div style={{ fontSize: 11, color: "var(--fg-4)", margin: "4px 0 10px" }}>Zielgehalt</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#34d399" }}>{anker?.toLocaleString("de-CH") ?? "—"}</div>
        <div style={{ fontSize: 11, color: "var(--fg-4)", marginTop: 2 }}>Anker</div>
      </div>
    );
  }
  // text tiles — show first ~80 chars
  const textMap: Record<string, string> = {
    "salary-tips":      (d["markteinschätzung"] as string | undefined) ?? "",
    "company-research": (d.unternehmensueberblick as string | undefined) ?? "",
    "letter-review":    (d.gesamteindruck as string | undefined) ?? "",
  };
  if (id in textMap) {
    const text = textMap[id].slice(0, 80);
    return <span style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.5, textAlign: "center" }}>{text}{textMap[id].length > 80 ? "…" : ""}</span>;
  }
  if (id === "ats-keywords") {
    const kws = (d.mustHave as string[] | undefined) ?? [];
    return (
      <div style={{ lineHeight: 2.2, textAlign: "center" }}>
        {kws.slice(0, 4).map((k, i) => (
          <span key={i} style={{ display: "inline-block", padding: "3px 10px", borderRadius: 4, margin: "2px 3px", fontSize: 12, fontWeight: 600, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--accent)" }}>{k}</span>
        ))}
        {kws.length > 4 && <span style={{ fontSize: 11, color: "var(--fg-4)" }}> +{kws.length - 4}</span>}
      </div>
    );
  }
  if (id === "opening-sentences") {
    const saetze = d.saetze as Array<{ satz: string }> | undefined;
    const first = (saetze?.[0]?.satz ?? "").slice(0, 80);
    return <span style={{ fontSize: 12, color: "var(--fg-2)", fontStyle: "italic", lineHeight: 1.5, textAlign: "center" }}>„{first}…"</span>;
  }
  return null;
}

function AiResultTileLarge({ id, entry }: { id: string; entry: { data: unknown } | null }) {
  const label   = AI_RESULT_LABELS[id] ?? id;
  const content = entry ? renderTileContentLarge(id, entry.data) : null;
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "20px 16px 22px", borderRadius: 16, height: "100%",
      border: "1px solid var(--border)", background: "var(--surface)",
    }}>
      <span style={{ fontSize: 14, color: "var(--fg-3)", marginBottom: 16, lineHeight: 1, textAlign: "center" }}>
        {label}
      </span>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
        {content ?? (
          <span style={{ fontSize: 14, color: "var(--fg-3)", fontWeight: 500, textAlign: "center", lineHeight: 1.4 }}>
            {TILE_EMPTY_LABELS[id] ?? "—"}
          </span>
        )}
      </div>
    </div>
  );
}

// Endpoint map for direct execution from expand view
const ACTION_ENDPOINTS: Record<string, string> = {
  "glassdoor-check":   "/ai/glassdoor-check",
  "kununu-check":      "/ai/kununu-check",
  "linkedin-profile":  "/ai/linkedin-profile",
  "salary-check":      "/ai/salary-check",
  "ats-keywords":      "/ai/ats-keywords",
  "cv-highlights":     "/ai/cv-highlights",
  "interview-prep":    "/ai/interview-prep",
  "company-research":  "/ai/company-research",
  "ackermann-script":  "/ai/ackermann-script",
  "letter-review":     "/ai/letter-review",
  "opening-sentences": "/ai/opening-sentences",
  "onboarding":        "/ai/onboarding",
  "salary-tips":       "/ai/salary-tips",
};

function TileExpandView({ id, entry, appId, onClose, onRegister }: {
  id: string;
  entry: { data: unknown; createdAt: Date } | null;
  appId: string;
  onClose: () => void;
  onRegister?: (id: string, data: unknown) => void;
}) {
  const { ai } = useUiStore();
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const expandStyle: React.CSSProperties = {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 10, background: "var(--bg)", padding: "16px 20px",
    display: "flex", flexDirection: "column", overflow: "hidden",
  };

  const run = async () => {
    const endpoint = ACTION_ENDPOINTS[id];
    if (!endpoint) return;
    if (ai.provider === "none") { setErr("KI-Modell in Settings konfigurieren"); return; }
    setErr(null); setRunning(true);
    try {
      const aiBody = { ai: { provider: ai.provider, anthropicApiKey: ai.anthropicApiKey, lmStudioUrl: ai.lmStudioUrl, lmStudioModel: ai.lmStudioModel } };
      const r = await api.post<Record<string, unknown>>(`/api/applications/${appId}${endpoint}`, aiBody);
      onRegister?.(id, r.data);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Fehler";
      setErr(msg);
    } finally { setRunning(false); }
  };

  const hasData = !!entry;
  const ts = entry?.createdAt.toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ ...expandStyle, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--fg-1)" }}>
          {AI_RESULT_LABELS[id] ?? id}
        </span>
        {ts && <span style={{ fontSize: 10, color: "var(--fg-4)" }}>{ts}</span>}
        <div style={{ flex: 1 }} />
        {ACTION_ENDPOINTS[id] && (
          <button className="btn btn-secondary" style={{ fontSize: 11, gap: 5 }} disabled={running} onClick={run}>
            {running
              ? <RefreshCircle width={11} height={11} style={{ animation: "spin 1s linear infinite" }} />
              : <Refresh width={11} height={11} />
            }
            {hasData ? "Aktualisieren" : "Jetzt ausführen"}
          </button>
        )}
        <button onClick={onClose} title="Schliessen"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", display: "flex", padding: 2 }}>
          <Collapse width={13} height={13} />
        </button>
      </div>
      {err && <div style={{ fontSize: 11, color: "#f87171", marginBottom: 8, flexShrink: 0 }}>{err}</div>}

      {/* Two-column: left = detail content, right = large tile */}
      <div style={{ display: "flex", gap: 20, flex: 1, minHeight: 0 }}>
        {/* Left column — detail content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {hasData ? (
            <AiResultDetail id={id} data={entry.data} appId={appId} onUpdate={onRegister} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60%", gap: 12 }}>
              <Expand width={28} height={28} style={{ opacity: 0.3, color: "var(--fg-3)" }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-2)" }}>
                {TILE_EMPTY_LABELS[id] ?? "Analyse starten"}
              </span>
            </div>
          )}
        </div>

        {/* Right column — large tile (2× scale) */}
        <div style={{ width: 200, flexShrink: 0 }}>
          <AiResultTileLarge id={id} entry={entry} />
        </div>
      </div>
    </div>
  );
}

function DetailsTab({ app, stage, url, onUrlChange, onSave, aiResults, onAiResultUpdate }: {
  app: Application; stage: string;
  url: string; onUrlChange: (url: string) => void;
  onSave: (patch: Partial<Application>) => void;
  aiResults?: Record<string, { data: unknown; createdAt: Date }>;
  onAiResultUpdate?: (id: string, data: unknown) => void;
}) {
  const [description, setDescription] = useState(app.description ?? "");
  const [descSaved,   setDescSaved]   = useState(false);
  const [descExpanded,  setDescExpanded]  = useState(false);
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [descMode,    setDescMode]    = useState<"preview" | "edit">("preview");

  const saveDesc = () => {
    onSave({ description });
    setDescSaved(true);
    setTimeout(() => setDescSaved(false), 1500);
  };

  const expandStyle: React.CSSProperties = {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 10, background: "var(--bg)", padding: "16px 20px",
    display: "flex", flexDirection: "column", overflow: "hidden",
  };

  const STAGE_TILES: Record<string, string[]> = {
    import_validating: ["glassdoor-check","kununu-check","linkedin-profile","salary-check","ats-keywords"],
    preparing_cv:      ["cv-highlights"],
    preparing_letter:  ["letter-review","opening-sentences"],
    application_sent:  ["company-research","salary-tips"],
    pending:           ["company-research","ackermann-script","salary-tips"],
    interview_1:       ["interview-prep","salary-tips"],
    interview_2:       ["interview-prep","salary-tips"],
    rejected:          [],
    accepted:          ["onboarding"],
  };

  const stageTileIds = STAGE_TILES[app.stage] ?? [];
  // Merge: stage-tiles (immer sichtbar) + weitere bereits generierte Ergebnisse anderer Phasen
  const tileIds = [...new Set([
    ...stageTileIds,
    ...Object.keys(aiResults ?? {}).filter(k => aiResults?.[k]?.data),
  ])];
  const tileEntries: [string, { data: unknown; createdAt: Date } | null][] =
    tileIds.map(id => [id, aiResults?.[id] ?? null]);

  const expandedEntry = expandedResultId ? (aiResults?.[expandedResultId] ?? null) : null;

  return (
    <>
      {/* Übersicht-Inhalt */}
      <OverviewTab app={app} stage={stage} url={url} onUrlChange={onUrlChange} onSave={onSave} />

      {/* KI-Erkenntnisse — Grid aus Kacheln (immer sichtbar für stage-relevante Aktionen) */}
      {tileEntries.length > 0 && (
        <div style={{ marginTop: 16, marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
            KI-Erkenntnisse
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gridAutoFlow: "dense", gap: 6 }}>
            {tileEntries.map(([id, entry]) => (
              <AiResultTile key={id} id={id} entry={entry} onExpand={() => setExpandedResultId(id)} />
            ))}
          </div>
        </div>
      )}

      {/* Vollbild-Expand — auch für leere Kacheln */}
      {expandedResultId && (
        <TileExpandView
          id={expandedResultId}
          entry={expandedEntry}
          appId={app.id}
          onClose={() => setExpandedResultId(null)}
          onRegister={onAiResultUpdate}
        />
      )}

      {/* Stellenbeschreibung — expandierbar */}
      <div style={descExpanded ? expandStyle : { marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Stellenbeschreibung
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Vorschau / Bearbeiten toggle */}
            <div style={{ display: "flex", gap: 2, background: "var(--surface-2)", borderRadius: 6, padding: 2 }}>
              {(["preview", "edit"] as const).map(m => (
                <button key={m} onClick={() => setDescMode(m)} style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "none", cursor: "pointer",
                  background: descMode === m ? "var(--surface)" : "transparent",
                  color: descMode === m ? "var(--fg-1)" : "var(--fg-3)",
                  fontFamily: "var(--font-sans)", fontWeight: 600,
                }}>
                  {m === "preview" ? "Vorschau" : "Bearbeiten"}
                </button>
              ))}
            </div>
            {app.url && (
              <a href={app.url} target="_blank" rel="noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--accent)", fontSize: 11, fontWeight: 600, textDecoration: "none" }}>
                <OpenNewWindow width={11} height={11} /> Original
              </a>
            )}
            {descSaved && <span style={{ fontSize: 11, color: "#4ade80" }}>✓</span>}
            <button onClick={() => setDescExpanded(v => !v)} title={descExpanded ? "Minimieren" : "Maximieren"}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", display: "flex", padding: 2 }}>
              {descExpanded ? <Collapse width={13} height={13} /> : <Expand width={13} height={13} />}
            </button>
          </div>
        </div>
        <div style={descExpanded ? { flex: 1, overflow: "auto" } : {}}>
          {descMode === "preview" ? (
            <div className="md-body" style={{ padding: "4px 0" }}>
              {description
                ? <ReactMarkdown remarkPlugins={[remarkGfm]}
                    components={{ a: ({ href, children }) => (
                      <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                    )}}>
                    {description}
                  </ReactMarkdown>
                : <div style={{ fontSize: 12, color: "var(--fg-3)" }}>Noch keine Stellenbeschreibung vorhanden — wechsle zu „Bearbeiten" um Text einzufügen.</div>
              }
            </div>
          ) : (
            <AutoTextarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              onBlur={saveDesc}
              placeholder="Stellenbeschreibung einfügen (Markdown unterstützt)…"
              minRows={descExpanded ? 20 : 8}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ─── Documents Tab ────────────────────────────────────────────
const DOC_STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  draft:       { bg: "rgba(148,163,184,0.12)", color: "#94a3b8", label: "Entwurf" },
  in_progress: { bg: "rgba(251,191,36,0.12)",  color: "#fbbf24", label: "In Arbeit" },
  final:       { bg: "rgba(52,211,153,0.14)",  color: "#34d399", label: "Final" },
  sent:        { bg: "rgba(96,165,250,0.12)",  color: "#60a5fa", label: "Gesendet" },
};

const LIB_CATEGORIES: { value: string; label: string; color: string }[] = [
  { value: "lebenslauf",           label: "Lebenslauf",           color: "#4285f4" },
  { value: "motivationsschreiben", label: "Motivationsschreiben", color: "#0f9d58" },
  { value: "zeugnis",              label: "Zeugnisse",            color: "#3b82f6" },
  { value: "referenz",             label: "Referenzen",           color: "#10b981" },
  { value: "zertifikat",           label: "Zertifikate",          color: "#f59e0b" },
  { value: "portfolio",            label: "Portfolio",            color: "#8b5cf6" },
  { value: "figma",                label: "Figma",                color: "#f24e1e" },
  { value: "sonstiges",            label: "Sonstiges",            color: "var(--fg-3)" },
];

function catToDocType(cat: string): "cv" | "letter" | "other" {
  if (cat === "lebenslauf")           return "cv";
  if (cat === "motivationsschreiben") return "letter";
  return "other";
}

// ─── File-type icons ──────────────────────────────────────────
const GDocIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="4" y="2" width="16" height="20" rx="2" fill="#4285f4" opacity="0.15" stroke="#4285f4" strokeWidth="1.5"/>
    <path d="M14 2v5h5" stroke="#4285f4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="8" y1="13" x2="16" y2="13" stroke="#4285f4" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="8" y1="17" x2="14" y2="17" stroke="#4285f4" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const PdfIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="6" fill="#EA4335" opacity="0.12"/>
    <path d="M8 4h12l6 6v18a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z" fill="#EA4335" opacity="0.2" stroke="#EA4335" strokeWidth="1.5"/>
    <path d="M20 4v6h6" stroke="#EA4335" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <text x="16" y="24" fontSize="8" fontWeight="800" fill="#EA4335" textAnchor="middle" fontFamily="Arial,sans-serif">PDF</text>
  </svg>
);

const GoogleDocIconLarge = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="6" fill="#4285F4" opacity="0.1"/>
    <path d="M9 4h10l7 7v17a2 2 0 01-2 2H9a2 2 0 01-2-2V6a2 2 0 012-2z" fill="white" stroke="#4285F4" strokeWidth="1.5"/>
    <path d="M19 4v7h7" stroke="#4285F4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="10" y1="17" x2="22" y2="17" stroke="#4285F4" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="10" y1="21" x2="18" y2="21" stroke="#4285F4" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const FigmaIconLarge = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="6" fill="#1ABCFE" opacity="0.1"/>
    <circle cx="20" cy="16" r="4" fill="#1ABCFE"/>
    <path d="M8 24a4 4 0 004-4v-4H8a4 4 0 000 8z" fill="#0ACF83"/>
    <path d="M8 16h4V8H8a4 4 0 000 8z" fill="#FF7262"/>
    <path d="M12 8h4a4 4 0 010 8h-4V8z" fill="#F24E1E"/>
    <path d="M12 16h4a4 4 0 010 8h-4v-8z" fill="#A259FF"/>
  </svg>
);

const ImageIconLarge = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="6" fill="#F59E0B" opacity="0.1"/>
    <rect x="5" y="7" width="22" height="18" rx="3" stroke="#F59E0B" strokeWidth="1.5"/>
    <circle cx="11" cy="13" r="2.5" fill="#F59E0B" opacity="0.7"/>
    <path d="M5 22l7-7 5 5 3-3 7 7" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const LinkIconLarge = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="6" fill="#6B7280" opacity="0.1"/>
    <path d="M13 19a5 5 0 007.07 0l3-3a5 5 0 00-7.07-7.07l-1.5 1.5" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M19 13a5 5 0 00-7.07 0l-3 3a5 5 0 007.07 7.07l1.5-1.5" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

function DocTileIcon({ fileType, size = 28 }: { fileType: string; size?: number }) {
  if (fileType === "pdf")   return <PdfIcon size={size} />;
  if (fileType === "gdoc")  return <GoogleDocIconLarge size={size} />;
  if (fileType === "figma") return <FigmaIconLarge size={size} />;
  if (fileType === "image") return <ImageIconLarge size={size} />;
  return <LinkIconLarge size={size} />;
}

function docTileAccent(fileType: string): string {
  if (fileType === "pdf")   return "#EA4335";
  if (fileType === "gdoc")  return "#4285F4";
  if (fileType === "figma") return "#1ABCFE";
  if (fileType === "image") return "#F59E0B";
  return "#6B7280";
}

type DriveTemplate = { id: string; name: string; mimeType: string; webViewLink: string; capabilities?: { canCopy?: boolean } };

function DocumentsTab({ app }: { app: Application }) {
  const { driveNameFolder, driveNameDoc, driveApplicationsFolderId } = useUiStore();
  const { data: appDocs = [], refetch } = useQuery<ApplicationDocument[]>({
    queryKey: ["documents", app.id],
    queryFn: () => api.get(`/api/applications/${app.id}/documents`).then((r) => r.data)
  });
  const { data: library = [] } = useQuery<UserDocument[]>({
    queryKey: ["user-documents"],
    queryFn: () => api.get("/api/documents").then((r) => r.data)
  });

  const [creating, setCreating] = useState<"cv" | "letter" | null>(null);
  const [newName, setNewName]   = useState("");
  const [googleConnected, setGoogleConnected] = useState(false);
  const [libOpen, setLibOpen]   = useState(true);
  const [togglingId, setTogglingId]     = useState<string | null>(null);
  const [copyingLibId, setCopyingLibId] = useState<string | null>(null);
  const [copyLibErr, setCopyLibErr]     = useState<string | null>(null);
  // Map of userDocumentId → drive URL (for docs already copied to this app's folder)
  const [libDriveUrls, setLibDriveUrls] = useState<Record<string, string>>({});

  // Toast feedback
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string, type: "success" | "error" = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  };

  // Drive folder state
  const [folderState, setFolderState] = useState<{ folderId: string; folderUrl: string } | null>(
    app.googleFolderId ? { folderId: app.googleFolderId, folderUrl: app.googleFolderUrl ?? "" } : null
  );
  const [folderCreating, setFolderCreating] = useState(false);
  const [templates, setTemplates] = useState<DriveTemplate[] | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [driveErr, setDriveErr] = useState<string | null>(null);
  // Live Drive folder contents
  const [driveFiles, setDriveFiles]               = useState<DriveTemplate[] | null>(null);
  const [driveFilesLoading, setDriveFilesLoading] = useState(false);
  const [deletingFileId, setDeletingFileId]       = useState<string | null>(null);

  useEffect(() => {
    api.get<{ connected: boolean }>("/api/google/status")
      .then((r) => setGoogleConnected(r.data.connected)).catch(() => {});
  }, []);

  // Load templates when folder exists
  useEffect(() => {
    if (!folderState || templates !== null) return;
    setTemplatesLoading(true);
    api.get<DriveTemplate[]>("/api/drive/templates")
      .then(r => setTemplates(r.data))
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, [folderState, templates]);

  // Load live Drive folder contents
  const loadDriveFiles = async () => {
    if (!folderState) return;
    setDriveFilesLoading(true);
    try {
      const r = await api.get<DriveTemplate[]>(`/api/applications/${app.id}/drive/files`);
      setDriveFiles(r.data);
    } catch { setDriveFiles([]); }
    finally { setDriveFilesLoading(false); }
  };

  useEffect(() => {
    if (folderState && driveFiles === null) void loadDriveFiles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderState]);

  const deleteDriveFile = async (fileId: string) => {
    setDeletingFileId(fileId);
    try {
      await api.delete(`/api/applications/${app.id}/drive/files/${fileId}`);
      setDriveFiles(prev => prev?.filter(f => f.id !== fileId) ?? null);
      refetch();
    } catch { /* ignore */ }
    setDeletingFileId(null);
  };

  const createFolder = async () => {
    setFolderCreating(true); setDriveErr(null);
    try {
      const r = await api.post<{ folderId: string; folderUrl: string; name: string }>(
        `/api/applications/${app.id}/drive/init-folder`,
        { folderRule: driveNameFolder, parentFolderId: driveApplicationsFolderId || undefined }
      );
      setFolderState({ folderId: r.data.folderId, folderUrl: r.data.folderUrl });
      setTemplates(null);   // trigger template load
      setDriveFiles(null);  // trigger drive files load
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Fehler";
      setDriveErr(msg);
    } finally { setFolderCreating(false); }
  };

  const copyTemplate = async (tmpl: DriveTemplate) => {
    if (!folderState) return;
    setCopyingId(tmpl.id); setDriveErr(null);
    try {
      await api.post(`/api/applications/${app.id}/drive/copy-template`, {
        templateFileId: tmpl.id,
        docRule: driveNameDoc
      });
      refetch();
      void loadDriveFiles();  // refresh Drive list after copy
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Fehler";
      setDriveErr(msg);
    } finally { setCopyingId(null); }
  };

  // Set of user_document_ids already linked to this application
  const linkedIds = new Set(appDocs.map((d) => d.userDocumentId).filter(Boolean) as string[]);

  const toggleLibDoc = async (libDoc: UserDocument) => {
    setTogglingId(libDoc.id);
    if (linkedIds.has(libDoc.id)) {
      const match = appDocs.find((d) => d.userDocumentId === libDoc.id);
      if (match) {
        await api.delete(`/api/applications/${app.id}/documents/${match.id}`).catch(() => {});
        showToast(`„${libDoc.name}" entfernt`);
      }
    } else {
      const isGDoc = libDoc.fileType === "gdoc";
      const isPdf  = libDoc.fileType === "pdf";
      // If Drive folder exists and it's a Google Doc → copy to Drive first
      let googleDocUrl = isGDoc ? libDoc.url : undefined;
      setCopyLibErr(null);
      // Copy Google Docs to Drive folder
      if (folderState && isGDoc && libDoc.url) {
        try {
          const r = await api.post<{ driveUrl: string; name: string }>(
            `/api/applications/${app.id}/drive/copy-doc`,
            { userDocumentId: libDoc.id, docRule: driveNameDoc }
          );
          googleDocUrl = r.data.driveUrl;
          setLibDriveUrls(prev => ({ ...prev, [libDoc.id]: r.data.driveUrl }));
        } catch (e: unknown) {
          const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
          setCopyLibErr(msg ?? null);
          showToast(msg ?? "Google Doc konnte nicht kopiert werden", "error");
        }
      }
      // Copy PDFs to Drive folder (upload from URL directly into app folder)
      let finalFileUrl = !isGDoc ? libDoc.url : undefined;
      if (folderState && isPdf && libDoc.url) {
        try {
          const r = await api.post<{ fileUrl: string }>(
            `/api/applications/${app.id}/drive/upload-pdf-from-url`,
            { url: libDoc.url, fileName: libDoc.name }
          );
          finalFileUrl = r.data.fileUrl;
          setLibDriveUrls(prev => ({ ...prev, [libDoc.id]: r.data.fileUrl }));
        } catch (e: unknown) {
          const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
          setCopyLibErr(msg ?? "PDF-Upload fehlgeschlagen");
          showToast(msg ?? "PDF konnte nicht auf Drive kopiert werden", "error");
        }
      }
      await api.post(`/api/applications/${app.id}/documents`, {
        type: catToDocType(libDoc.category),
        name: libDoc.name,
        status: "draft",
        googleDocUrl,
        fileUrl: finalFileUrl,
        userDocumentId: libDoc.id,
      }).catch(() => {});
      showToast(
        folderState && (isGDoc || isPdf)
          ? `„${libDoc.name}" hinzugefügt & auf Drive kopiert`
          : `„${libDoc.name}" hinzugefügt`
      );
      // Refresh Drive file list
      void loadDriveFiles();
    }
    setTogglingId(null);
    refetch();
  };

  const copyLibDocToDrive = async (libDoc: UserDocument) => {
    if (!folderState || libDoc.fileType !== "gdoc") return;
    setCopyingLibId(libDoc.id);
    try {
      const r = await api.post<{ driveUrl: string }>(
        `/api/applications/${app.id}/drive/copy-doc`,
        { userDocumentId: libDoc.id, docRule: driveNameDoc }
      );
      setLibDriveUrls(prev => ({ ...prev, [libDoc.id]: r.data.driveUrl }));
      // Update the linked applicationDocument with new Drive URL
      const match = appDocs.find((d) => d.userDocumentId === libDoc.id);
      if (match) {
        await api.patch(`/api/applications/${app.id}/documents/${match.id}`, { googleDocUrl: r.data.driveUrl }).catch(() => {});
        refetch();
      }
      showToast(`„${libDoc.name}" auf Drive kopiert`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg ?? "Kopieren fehlgeschlagen", "error");
    }
    setCopyingLibId(null);
  };

  const create = async (type: "cv" | "letter") => {
    const name = newName.trim() || (type === "cv" ? "Lebenslauf" : "Anschreiben");
    let googleDocUrl: string | undefined;
    let googleDocId: string | undefined;
    if (googleConnected) {
      try {
        const res = await api.post<{ docId: string; docUrl: string }>("/api/google/docs/create", { title: `${name} — ${app.company}` });
        googleDocId = res.data.docId;
        googleDocUrl = res.data.docUrl;
      } catch { /* fall through */ }
    }
    await api.post(`/api/applications/${app.id}/documents`, { type, name, status: "draft", googleDocId, googleDocUrl });
    setNewName(""); setCreating(null); refetch();
  };

  const updateStatus = async (docId: string, status: string) => {
    await api.patch(`/api/applications/${app.id}/documents/${docId}`, { status });
    refetch();
  };
  const deleteDoc = async (docId: string) => {
    await api.delete(`/api/applications/${app.id}/documents/${docId}`);
    refetch();
  };

  // ─── Linked docs (already assigned) ──────────────────────────
  const linkedDocs = appDocs;

  return (
    <>
      {/* ── Google Drive Ordner — Notion-style ── */}
      {googleConnected && (
        <div style={{ marginBottom: 20 }}>
          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" stroke="var(--fg-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-2)", flex: 1 }}>Google Drive</span>
            {folderState && (
              <>
                <button onClick={() => { setDriveFiles(null); }} title="Aktualisieren"
                  style={{ background: "none", border: "none", cursor: driveFilesLoading ? "wait" : "pointer", color: "var(--fg-3)", display: "flex", padding: 2 }}>
                  <Refresh width={11} height={11} style={{ animation: driveFilesLoading ? "spin 1s linear infinite" : "none" }} />
                </button>
                <a href={folderState.folderUrl} target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, color: "var(--fg-3)", textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}>
                  <OpenNewWindow width={10} height={10} /> Ordner öffnen
                </a>
              </>
            )}
          </div>

          {driveErr && <div style={{ fontSize: 11, color: "#f87171", marginBottom: 8 }}>{driveErr}</div>}

          {!folderState ? (
            <button onClick={createFolder} disabled={folderCreating}
              style={{ fontSize: 11, color: "var(--fg-3)", background: "none", border: "none", cursor: folderCreating ? "wait" : "pointer", fontFamily: "var(--font-sans)", display: "flex", alignItems: "center", gap: 5, padding: "4px 0" }}>
              {folderCreating
                ? <><RefreshCircle width={11} height={11} style={{ animation: "spin 1s linear infinite" }} /> Erstelle Ordner…</>
                : <><Plus width={11} height={11} /> Bewerbungsordner erstellen</>}
            </button>
          ) : (
            <>
              {/* Live Drive folder contents */}
              {driveFiles === null && driveFilesLoading && (
                <div style={{ fontSize: 11, color: "var(--fg-3)", display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
                  <RefreshCircle width={11} height={11} style={{ animation: "spin 1s linear infinite" }} /> Lade Ordner-Inhalt…
                </div>
              )}
              {driveFiles !== null && driveFiles.length === 0 && (
                <div style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 8 }}>Ordner ist leer</div>
              )}
              {driveFiles !== null && driveFiles.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  {driveFiles.map((f) => {
                    const fileType = f.mimeType.includes("document") ? "gdoc"
                      : f.mimeType.includes("pdf") ? "pdf"
                      : f.mimeType.includes("spreadsheet") ? "link"
                      : "link";
                    const isDeleting = deletingFileId === f.id;
                    return (
                      <div key={f.id} className="notion-doc-row" style={{
                        display: "flex", alignItems: "center", gap: 7,
                        padding: "4px 4px 4px 2px", borderRadius: 5, transition: "background 0.1s"
                      }}>
                        <DocTileIcon fileType={fileType} size={18} />
                        <span style={{ flex: 1, fontSize: 12, color: "var(--fg-1)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                          {f.name}
                        </span>
                        <a href={f.webViewLink} target="_blank" rel="noreferrer"
                          style={{ color: "var(--fg-3)", display: "flex", flexShrink: 0, opacity: 0.6 }} title="Öffnen">
                          <OpenNewWindow width={10} height={10} />
                        </a>
                        <button className="btn btn-ghost btn-icon" style={{ padding: 2, flexShrink: 0, opacity: 0.5 }}
                          title="Aus Drive löschen" disabled={isDeleting} onClick={() => deleteDriveFile(f.id)}>
                          {isDeleting
                            ? <RefreshCircle width={10} height={10} style={{ animation: "spin 1s linear infinite" }} />
                            : <Trash width={10} height={10} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

            </>
          )}
        </div>
      )}

      {/* ── Section 1: Zugewiesene Dokumente ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 8 }}>
          <div className="eyebrow" style={{ flex: 1 }}>Zugewiesen</div>
          <button className="btn btn-ghost" style={{ fontSize: 11, gap: 4, padding: "4px 8px" }}
            onClick={() => setCreating(creating ? null : "cv")}>
            <Plus width={11} height={11} /> Neu erstellen
          </button>
        </div>

        {!googleConnected && (
          <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", fontSize: 11, color: "#fbbf24", marginBottom: 10 }}>
            Google Drive nicht verbunden.{" "}
            <a href="/settings" style={{ color: "inherit", fontWeight: 700 }}>Verbinden →</a>
          </div>
        )}

        {creating && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10, padding: 10, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {(["cv", "letter"] as const).map((t) => (
                <button key={t} onClick={() => setCreating(t)} style={{
                  padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                  border: `1px solid ${creating === t ? "var(--accent)" : "var(--border)"}`,
                  background: creating === t ? "var(--accent-08)" : "transparent",
                  color: creating === t ? "var(--accent)" : "var(--fg-3)",
                  fontFamily: "var(--font-sans)"
                }}>{t === "cv" ? "Lebenslauf" : "Anschreiben"}</button>
              ))}
            </div>
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder={creating === "cv" ? "Lebenslauf v1" : "Anschreiben v1"}
              style={{ flex: 1, minWidth: 120, border: "none", background: "transparent", color: "var(--fg-1)", fontSize: 12, outline: "none" }}
              onKeyDown={(e) => e.key === "Enter" && create(creating)} autoFocus />
            <button className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => create(creating)}>
              {googleConnected ? "Erstellen + Google Doc" : "Erstellen"}
            </button>
            <button className="btn btn-ghost btn-icon" onClick={() => setCreating(null)}><Xmark width={13} height={13} /></button>
          </div>
        )}

        {linkedDocs.length === 0 && !creating ? (
          <div style={{ color: "var(--fg-3)", fontSize: 12, padding: "14px 0", textAlign: "center", border: "1px dashed var(--border)", borderRadius: 8 }}>
            Noch keine Dokumente zugewiesen
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {linkedDocs.map((doc) => {
              const status = DOC_STATUS_STYLES[doc.status ?? "draft"] ?? DOC_STATUS_STYLES.draft;
              const url = doc.googleDocUrl ?? doc.fileUrl;
              const isGDoc = !!doc.googleDocUrl;
              return (
                <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                  <div style={{ color: isGDoc ? "#4285f4" : "var(--fg-3)", flexShrink: 0 }}>
                    {isGDoc ? <GDocIcon size={14} /> : <Page width={14} height={14} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.name}</div>
                    <div style={{ fontSize: 10, color: "var(--fg-3)" }}>
                      {doc.type === "cv" ? "Lebenslauf" : doc.type === "letter" ? "Anschreiben" : "Dokument"}
                      {doc.userDocumentId && <span style={{ marginLeft: 4, color: "var(--accent)" }}>· Bibliothek</span>}
                    </div>
                  </div>
                  <select value={doc.status ?? "draft"} onChange={(e) => updateStatus(doc.id, e.target.value)}
                    style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 999, border: "1px solid", borderColor: status.color, background: status.bg, color: status.color, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                    {Object.entries(DOC_STATUS_STYLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  {url && (
                    <a href={url} target="_blank" rel="noreferrer" style={{
                      display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6,
                      border: `1px solid ${isGDoc ? "#4285f4" : "var(--border)"}`,
                      background: isGDoc ? "rgba(66,133,244,0.08)" : "transparent",
                      color: isGDoc ? "#4285f4" : "var(--fg-2)", fontSize: 11, fontWeight: 600,
                      textDecoration: "none", whiteSpace: "nowrap"
                    }}>
                      {isGDoc ? <GDocIcon size={11} /> : <OpenNewWindow width={11} height={11} />}
                      {isGDoc ? "Öffnen" : "Link"}
                    </a>
                  )}
                  <button className="btn btn-ghost btn-icon" onClick={() => deleteDoc(doc.id)}><Trash width={12} height={12} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section 2: Bibliothek ── */}
      <div>
        <button
          onClick={() => setLibOpen((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", background: "none", border: "none", cursor: "pointer", padding: "4px 0 10px", color: "var(--fg-2)", fontFamily: "var(--font-sans)" }}
        >
          <NavArrowRight width={13} height={13} style={{ transform: libOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
          <div className="eyebrow" style={{ flex: 1, textAlign: "left" }}>Aus Bibliothek zuweisen</div>
          {copyLibErr && null /* errors shown as toast */}
          {library.length > 0 && (
            <span style={{ fontSize: 10, color: "var(--fg-3)", fontWeight: 600 }}>{library.length} Dokumente</span>
          )}
        </button>

        {libOpen && (
          library.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--fg-3)", padding: "12px 0", textAlign: "center", border: "1px dashed var(--border)", borderRadius: 8 }}>
              Keine Dokumente in der Bibliothek —{" "}
              <a href="/documents" style={{ color: "var(--accent)", fontWeight: 600 }}>Dokumente hinzufügen →</a>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {LIB_CATEGORIES.map((cat) => {
                const catDocs = library.filter((d) => d.category === cat.value);
                if (catDocs.length === 0) return null;
                return (
                  <div key={cat.value}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: cat.color, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                      {cat.label}
                    </div>
                    {/* Mini document tiles grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
                      {catDocs.map((libDoc) => {
                        const isLinked   = linkedIds.has(libDoc.id);
                        const isToggling = togglingId === libDoc.id;
                        const isCopying  = copyingLibId === libDoc.id;
                        const isGDoc     = libDoc.fileType === "gdoc";
                        const isPdf      = libDoc.fileType === "pdf";
                        // Figma, link, image can't be copied to Drive → only link-copy action
                        const canDriveCopy = isGDoc || isPdf;
                        const hasDriveCopy = !!libDriveUrls[libDoc.id] ||
                          (isLinked && !!appDocs.find(d => d.userDocumentId === libDoc.id)?.googleDocUrl &&
                           appDocs.find(d => d.userDocumentId === libDoc.id)?.googleDocUrl !== libDoc.url);
                        const driveUrl = libDriveUrls[libDoc.id] ||
                          (isLinked ? appDocs.find(d => d.userDocumentId === libDoc.id)?.googleDocUrl : undefined);
                        const canCopyToDrive = folderState && isGDoc && isLinked && !hasDriveCopy;

                        const fileAccent = docTileAccent(libDoc.fileType);
                        const borderColor = isLinked
                          ? (hasDriveCopy ? "#34d399" : fileAccent)
                          : "var(--border)";
                        const bgColor = isLinked
                          ? (hasDriveCopy ? "rgba(52,211,153,0.07)" : `${fileAccent}12`)
                          : "var(--surface-2)";

                        return (
                          <div key={libDoc.id}
                            onClick={() => !isToggling && !isCopying && toggleLibDoc(libDoc)}
                            style={{
                              position: "relative", borderRadius: 10, cursor: isToggling ? "wait" : "pointer",
                              border: `1.5px solid ${borderColor}`, background: bgColor,
                              transition: "all 0.15s", overflow: "hidden",
                              display: "flex", flexDirection: "column", minHeight: 110
                            }}>
                            {/* Document tile top area */}
                            <div style={{ flex: 1, padding: "12px 8px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
                              {/* Branded icon */}
                              <DocTileIcon fileType={libDoc.fileType} size={32} />
                              {/* Name */}
                              <div style={{
                                fontSize: 10, fontWeight: 600, lineHeight: 1.3, textAlign: "center",
                                color: isLinked ? (hasDriveCopy ? "#34d399" : fileAccent) : "var(--fg-1)",
                                overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const,
                                wordBreak: "break-word"
                              }}>
                                {libDoc.name}
                              </div>
                            </div>

                            {/* Status bar at bottom */}
                            <div style={{
                              padding: "4px 6px", borderTop: `1px solid ${borderColor}40`,
                              display: "flex", alignItems: "center", justifyContent: "center", gap: 4, minHeight: 24
                            }}>
                              {isToggling ? (
                                <RefreshCircle width={10} height={10} style={{ animation: "spin 1s linear infinite", color: "var(--fg-3)" }} />
                              ) : isLinked ? (
                                hasDriveCopy ? (
                                  <span style={{ fontSize: 9, color: "#34d399", fontWeight: 700, display: "flex", alignItems: "center", gap: 2 }}>
                                    <Check width={9} height={9} /> Drive ✓
                                  </span>
                                ) : canCopyToDrive ? (
                                  <button onClick={(e) => { e.stopPropagation(); copyLibDocToDrive(libDoc); }} disabled={isCopying}
                                    style={{ fontSize: 9, color: "#4285f4", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", display: "flex", alignItems: "center", gap: 2, padding: 0 }}>
                                    {isCopying ? <RefreshCircle width={9} height={9} style={{ animation: "spin 1s linear infinite" }} /> : <GDocIcon size={9} />}
                                    {isCopying ? "…" : "→ Drive"}
                                  </button>
                                ) : (
                                  <span style={{ fontSize: 9, color: fileAccent, fontWeight: 700, display: "flex", alignItems: "center", gap: 2 }}>
                                    <Check width={9} height={9} /> Hinzugefügt
                                  </span>
                                )
                              ) : canDriveCopy ? (
                                <span style={{ fontSize: 9, color: "var(--fg-3)" }}>+ Hinzufügen</span>
                              ) : (
                                /* Figma / link / image — can't copy, offer link-copy instead */
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!libDoc.url) return;
                                    try {
                                      await copyText(libDoc.url);
                                      showToast("Link kopiert");
                                    } catch {
                                      showToast("Kopieren fehlgeschlagen", "error");
                                    }
                                  }}
                                  style={{ fontSize: 9, color: fileAccent, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", display: "flex", alignItems: "center", gap: 2, padding: 0 }}>
                                  <Link width={9} height={9} /> Link kopieren
                                </button>
                              )}
                            </div>

                            {/* Open link top-right: Drive copy URL if available, otherwise original URL */}
                            {(hasDriveCopy ? driveUrl : libDoc.url) && (
                              <a href={(hasDriveCopy ? driveUrl : libDoc.url)!} target="_blank" rel="noreferrer"
                                onClick={e => e.stopPropagation()}
                                style={{
                                  position: "absolute", top: 4, right: 4,
                                  width: 18, height: 18, borderRadius: 4,
                                  background: hasDriveCopy ? "rgba(66,133,244,0.12)" : "var(--surface-2)",
                                  border: `1px solid ${hasDriveCopy ? "rgba(66,133,244,0.25)" : "var(--border)"}`,
                                  color: hasDriveCopy ? "#4285f4" : "var(--fg-3)",
                                  display: "flex", alignItems: "center", justifyContent: "center"
                                }}
                                title={hasDriveCopy ? "In Drive öffnen" : "Öffnen"}>
                                <OpenNewWindow width={9} height={9} />
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Toast feedback */}
      {toast && (
        <div style={{
          position: "sticky", bottom: 16, zIndex: 20,
          alignSelf: "center",
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "9px 16px", borderRadius: 10,
          background: toast.type === "success" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
          border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}`,
          boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
          backdropFilter: "blur(8px)",
          fontSize: 12, fontWeight: 500,
          color: toast.type === "success" ? "#4ade80" : "#f87171",
          animation: "fade-in 0.15s ease",
          pointerEvents: "none",
        }}>
          {toast.type === "success"
            ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          }
          {toast.msg}
        </div>
      )}
    </>
  );
}

// ─── Process Tab (Tasks + AI + Timeline) ──────────────────────
const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  note:         <ChatBubbleEmpty width={13} height={13} />,
  email:        <Mail width={13} height={13} />,
  call:         <Phone width={13} height={13} />,
  interview:    <Calendar width={13} height={13} />,
  deadline:     <Clock width={13} height={13} />,
  stage_change: <NavArrowRight width={13} height={13} />,
  document:     <Page width={13} height={13} />
};
const ACTIVITY_TYPES = [
  { id: "note", label: "Notiz" }, { id: "email", label: "E-Mail" },
  { id: "call", label: "Anruf" }, { id: "interview", label: "Interview" },
  { id: "deadline", label: "Deadline" },
];

type Task = { id: string; stage: string; title: string; done: boolean; isDefault: boolean; sortOrder: number; createdAt: string };
type CvHighlights = { highlights: string[]; keywords: string[]; gaps: string[] };
type InterviewPrep = { rollenFragen: string[]; starBeispiele: { frage: string; situation: string; aufgabe: string; aktion: string; ergebnis: string }[]; vossFragenWhatHow: string[]; rueckfragen: string[] };
type EmailDraft = { subject: string; body: string };
type SalaryTips = { "markteinschätzung": string; taktiken: string[]; formulierungen: string[]; vossAnker: string };

type GlassdoorData = {
  rating: number | null;
  reviewCount: number | null;
  ceoApproval: number | null;
  recommendToFriend: number | null;
  confidence: "hoch" | "mittel" | "niedrig";
  summary: string;
  pros: string[];
  cons: string[];
  hinweis: string;
  glassdoorUrl: string;
  kununuUrl: string;
  linkedinUrl: string;
  updatedAt: string;
  manuallyEdited?: boolean;
};
type KununuData = {
  rating: number | null;
  reviewCount: number | null;
  confidence: "hoch" | "mittel" | "niedrig";
  summary: string;
  hinweis: string;
  url: string;
  updatedAt: string;
  manuallyEdited?: boolean;
};
type LinkedinData = {
  url: string;
  employeeCount?: string | null;
  description?: string;
  hinweis: string;
  updatedAt: string;
  manuallyEdited?: boolean;
};
type SalaryCheck = {
  lohnband: { min: number; max: number; median: number };
  waehrung: string;
  basis: string;
  begruendung: string;
  faktoren: string[];
};
type AtsKeywords = {
  mustHave: string[];
  niceToHave: string[];
  softSkills: string[];
  tools: string[];
};
type CompanyResearch = {
  unternehmensueberblick: string;
  branche: string;
  marktposition: string;
  unternehmenskultur: string;
  wettbewerber: string[];
  aktuelleThemen: string[];
  gespraechsthemen: string[];
};
type AckermannScript = {
  zielgehalt: number;
  ankergebot: number;
  schritte: Array<{ runde: number; angebot: number; formulierung: string; taktik: string }>;
  nichtmonetaer: string[];
  vossAnker: string;
};
type LetterReview = {
  gesamteindruck: string;
  staerken: string[];
  verbesserungen: string[];
  cliches: string[];
  tonalitaet: string;
  laenge: string;
  personalisierung: string;
};
type OpeningSentences = {
  saetze: Array<{ satz: string; ansatz: string; erklaerung: string }>;
};
type OnboardingChecklist = {
  erste30Tage: string[];
  erste60Tage: string[];
  erste90Tage: string[];
  allgemein: string[];
};

const STAGE_LABELS_DE: Record<string, string> = {
  import_validating: "Inbox", preparing_cv: "CV vorbereiten", preparing_letter: "Anschreiben",
  application_sent: "Beworben", pending: "Wartend", interview_1: "Interview 1",
  interview_2: "Interview 2", rejected: "Abgelehnt", accepted: "Zugesagt"
};

// ── Accordion helper ──
function Accordion({ title, count, color, children, onCopy, defaultOpen = true }: {
  title: string; count: number; color?: string; children: React.ReactNode;
  onCopy?: () => void; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)", padding: "6px 0" }}>
        <button onClick={() => setOpen(v => !v)} style={{
          flex: 1, display: "flex", alignItems: "center", gap: 8,
          background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", padding: 0
        }}>
          <NavArrowRight width={12} height={12} style={{ color: "var(--fg-3)", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: color ?? "var(--fg-2)", textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "left" }}>{title}</span>
          <span style={{ fontSize: 10, color: "var(--fg-3)", fontWeight: 600 }}>{count}</span>
        </button>
        {onCopy && (
          <button onClick={onCopy} title="Abschnitt kopieren" style={{
            marginLeft: 8, background: "none", border: "none", cursor: "pointer",
            color: "var(--fg-3)", display: "flex", alignItems: "center", padding: "0 2px",
            borderRadius: 4, transition: "color 0.15s"
          }}
            onMouseEnter={e => (e.currentTarget.style.color = color ?? "var(--accent)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--fg-3)")}>
            <IcCopy width={11} height={11} />
          </button>
        )}
      </div>
      {open && <div style={{ paddingTop: 8 }}>{children}</div>}
    </div>
  );
}

// ── Email Modal ──
function EmailModal({ draft, onClose }: { draft: EmailDraft; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { copyText(`${draft.subject}\n\n${draft.body}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 14, padding: 28, width: 520, maxHeight: "80vh", overflow: "auto", display: "flex", flexDirection: "column", gap: 14 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "var(--fg-1)" }}>Email-Entwurf</div>
        <div className="field" style={{ margin: 0 }}>
          <label>Betreff</label>
          <div style={{ fontSize: 13, color: "var(--fg-1)", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>{draft.subject}</div>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Nachricht</label>
          <div style={{ fontSize: 13, color: "var(--fg-1)", whiteSpace: "pre-wrap", lineHeight: 1.7, padding: "8px 0" }}>{draft.body}</div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-secondary" onClick={onClose}><Xmark width={12} height={12} /> Schliessen</button>
          <button className="btn btn-primary" onClick={copy}>{copied ? "✓ Kopiert!" : "Text kopieren"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Stage AI Actions ──
function StageAiActions({ app, onSave, onCvHighlightsChange, onInterviewPrepChange, onSalaryTipsChange,
  onSalaryCheckChange, onAtsKeywordsChange, onCompanyResearchChange, onAckermannScriptChange,
  onLetterReviewChange, onOpeningSentencesChange, onOnboardingChange, onGlassdoorChange,
  onKununuChange, onLinkedinChange, onAiResult }: {
  app: Application;
  onSave?: (patch: Partial<Application>) => void;
  onCvHighlightsChange?: (v: CvHighlights | null) => void;
  onInterviewPrepChange?: (v: InterviewPrep | null) => void;
  onSalaryTipsChange?: (v: SalaryTips | null) => void;
  onSalaryCheckChange?: (v: SalaryCheck | null) => void;
  onAtsKeywordsChange?: (v: AtsKeywords | null) => void;
  onCompanyResearchChange?: (v: CompanyResearch | null) => void;
  onAckermannScriptChange?: (v: AckermannScript | null) => void;
  onLetterReviewChange?: (v: LetterReview | null) => void;
  onOpeningSentencesChange?: (v: OpeningSentences | null) => void;
  onOnboardingChange?: (v: OnboardingChecklist | null) => void;
  onGlassdoorChange?: (v: GlassdoorData | null) => void;
  onKununuChange?: (v: KununuData | null) => void;
  onLinkedinChange?: (v: LinkedinData | null) => void;
  onAiResult?: (id: string, data: unknown) => void;
}) {
  const { ai } = useUiStore();
  const stage = app.stage;
  const [loading, setLoading] = useState<string | null>(null);
  const [resultTimes, setResultTimes] = useState<Record<string, Date>>(() => {
    const init: Record<string, Date> = {};
    if (app.glassdoorData) {
      try { const d = JSON.parse(app.glassdoorData as string); if (d.updatedAt) init["glassdoor-check"] = new Date(d.updatedAt); } catch {}
    }
    if ((app as Application & { kununuData?: string }).kununuData) {
      try { const d = JSON.parse((app as Application & { kununuData?: string }).kununuData!); if (d.updatedAt) init["kununu-check"] = new Date(d.updatedAt); } catch {}
    }
    if ((app as Application & { linkedinData?: string }).linkedinData) {
      try { const d = JSON.parse((app as Application & { linkedinData?: string }).linkedinData!); if (d.updatedAt) init["linkedin-profile"] = new Date(d.updatedAt); } catch {}
    }
    const raw = app.stage === "interview_1" ? app.interview1Prep : app.stage === "interview_2" ? app.interview2Prep : null;
    if (raw) { try { JSON.parse(raw); init["interview-prep"] = new Date(); } catch {} }
    // Load timestamps from cache
    const cache = (app as Application & { aiResultsCache?: string }).aiResultsCache;
    if (cache) {
      try {
        const parsed = JSON.parse(cache) as Record<string, { _savedAt?: string }>;
        for (const [key, entry] of Object.entries(parsed)) {
          if (!init[key] && entry._savedAt) init[key] = new Date(entry._savedAt);
        }
      } catch {}
    }
    return init;
  });
  const [cvHighlights, setCvHighlights] = useState<CvHighlights | null>(() => {
    try {
      const cache = (app as Application & { aiResultsCache?: string }).aiResultsCache;
      if (!cache) return null;
      const parsed = JSON.parse(cache) as Record<string, unknown>;
      return parsed["cv-highlights"] ? parsed["cv-highlights"] as CvHighlights : null;
    } catch { return null; }
  });

  const [interviewPrep, setInterviewPrep] = useState<InterviewPrep | null>(() => {
    const raw = stage === "interview_1" ? app.interview1Prep
              : stage === "interview_2" ? app.interview2Prep : null;
    try { return raw ? JSON.parse(raw) as InterviewPrep : null; } catch { return null; }
  });
  const [salaryTips, setSalaryTips] = useState<SalaryTips | null>(null);
  const [emailModal, setEmailModal] = useState<EmailDraft | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [salaryCheck,      setSalaryCheck]      = useState<SalaryCheck | null>(null);
  const [atsKeywords,      setAtsKeywords]       = useState<AtsKeywords | null>(null);
  const [companyResearch,  setCompanyResearch]   = useState<CompanyResearch | null>(null);
  const [ackermannScript,  setAckermannScript]   = useState<AckermannScript | null>(null);
  const [letterReview,     setLetterReview]      = useState<LetterReview | null>(null);
  const [openingSentences, setOpeningSentences]  = useState<OpeningSentences | null>(null);
  const [onboarding,       setOnboarding]        = useState<OnboardingChecklist | null>(null);
  const [glassdoor,        setGlassdoor]         = useState<GlassdoorData | null>(() => {
    try { return app.glassdoorData ? JSON.parse(app.glassdoorData as string) : null; } catch { return null; }
  });
  const [kununu, setKununu] = useState<KununuData | null>(() => {
    try { return (app as Application & { kununuData?: string }).kununuData ? JSON.parse((app as Application & { kununuData?: string }).kununuData!) : null; } catch { return null; }
  });
  const [linkedin, setLinkedin] = useState<LinkedinData | null>(() => {
    try { return (app as Application & { linkedinData?: string }).linkedinData ? JSON.parse((app as Application & { linkedinData?: string }).linkedinData!) : null; } catch { return null; }
  });

  const updateCvHighlights    = (v: CvHighlights | null)    => { setCvHighlights(v);     onCvHighlightsChange?.(v);     if (v) onAiResult?.("cv-highlights", v);     };
  const updateInterviewPrep   = (v: InterviewPrep | null)   => { setInterviewPrep(v);    onInterviewPrepChange?.(v);    if (v) onAiResult?.("interview-prep", v);    };
  const updateSalaryTips      = (v: SalaryTips | null)      => { setSalaryTips(v);       onSalaryTipsChange?.(v);       if (v) onAiResult?.("salary-tips", v);       };
  const updateSalaryCheck     = (v: SalaryCheck | null)     => { setSalaryCheck(v);      onSalaryCheckChange?.(v);      if (v) onAiResult?.("salary-check", v);      };
  const updateAtsKeywords     = (v: AtsKeywords | null)     => { setAtsKeywords(v);      onAtsKeywordsChange?.(v);      if (v) onAiResult?.("ats-keywords", v);      };
  const updateCompanyResearch = (v: CompanyResearch | null) => { setCompanyResearch(v);  onCompanyResearchChange?.(v);  if (v) onAiResult?.("company-research", v);  };
  const updateAckermannScript = (v: AckermannScript | null) => { setAckermannScript(v);  onAckermannScriptChange?.(v);  if (v) onAiResult?.("ackermann-script", v);  };
  const updateLetterReview    = (v: LetterReview | null)    => { setLetterReview(v);     onLetterReviewChange?.(v);     if (v) onAiResult?.("letter-review", v);     };
  const updateOpeningSentences= (v: OpeningSentences | null)=> { setOpeningSentences(v); onOpeningSentencesChange?.(v); if (v) onAiResult?.("opening-sentences", v); };
  const updateOnboarding      = (v: OnboardingChecklist | null) => { setOnboarding(v);   onOnboardingChange?.(v);       if (v) onAiResult?.("onboarding", v);        };
  const updateGlassdoor       = (v: GlassdoorData | null)       => { setGlassdoor(v);    onGlassdoorChange?.(v);        if (v) onAiResult?.("glassdoor-check", v);   };
  const updateKununu          = (v: KununuData | null)           => { setKununu(v);       onKununuChange?.(v);           if (v) onAiResult?.("kununu-check", v);      };
  const updateLinkedin        = (v: LinkedinData | null)         => { setLinkedin(v);     onLinkedinChange?.(v);         if (v) onAiResult?.("linkedin-profile", v);  };

  void salaryCheck; void atsKeywords; void companyResearch; void ackermannScript;
  void letterReview; void openingSentences; void onboarding; void glassdoor; void kununu; void linkedin;

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string, type: "success" | "error" = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  };
  const copySection = async (text: string, label = "Kopiert") => {
    try { await copyText(text); showToast(label); }
    catch { showToast("Kopieren fehlgeschlagen", "error"); }
  };

  // Calendar / iCal (interview stages)
  const ivRound = stage === "interview_1" ? 1 : 2;
  const ivRaw   = stage === "interview_1" ? app.interview1Details : app.interview2Details;
  const ivDetails: InterviewDetails = (() => { try { return ivRaw ? JSON.parse(ivRaw) : {}; } catch { return {}; } })();
  const { data: calProfile } = useQuery<{ googleCalendarId?: string | null }>({
    queryKey: ["profile"],
    queryFn: () => api.get("/api/profile").then(r => r.data),
    enabled: stage === "interview_1" || stage === "interview_2",
  });
  const openGoogleCalendar = () => {
    if (!ivDetails.date || !ivDetails.time) { showToast("Bitte zuerst Termin erfassen", "error"); return; }
    const timeStr = ivDetails.time.replace(":", "");
    const start   = ivDetails.date.replace(/-/g, "") + "T" + timeStr + "00";
    const endDt   = new Date(`${ivDetails.date}T${ivDetails.time}:00`);
    endDt.setMinutes(endDt.getMinutes() + (ivDetails.duration ?? 60));
    const end = endDt.getFullYear().toString() + String(endDt.getMonth()+1).padStart(2,"0") +
      String(endDt.getDate()).padStart(2,"0") + "T" +
      String(endDt.getHours()).padStart(2,"0") + String(endDt.getMinutes()).padStart(2,"0") + "00";
    const loc = ivDetails.format === "onsite" ? (ivDetails.location ?? "") : (ivDetails.videoUrl ?? "");
    const desc = [
      `Interview Runde ${ivRound}: ${app.role} @ ${app.company}`,
      ivDetails.format === "video" && ivDetails.videoProvider ? `Anbieter: ${ivDetails.videoProvider}` : "",
      ivDetails.format === "video" && ivDetails.videoCode ? `Meeting-Code: ${ivDetails.videoCode}` : "",
      ivDetails.interviewer ? `Gesprächspartner: ${ivDetails.interviewer}` : "",
      ivDetails.notes ? `Notizen: ${ivDetails.notes}` : "",
      (app.portalUrl ?? app.url) ? `Link: ${app.portalUrl ?? app.url}` : "",
    ].filter(Boolean).join("\n");
    const url = new URL("https://calendar.google.com/calendar/r/eventedit");
    url.searchParams.set("text", `Interview ${ivRound}: ${app.role} @ ${app.company}`);
    url.searchParams.set("dates", `${start}/${end}`);
    if (loc) url.searchParams.set("location", loc);
    url.searchParams.set("details", desc);
    if (calProfile?.googleCalendarId) url.searchParams.set("calid", calProfile.googleCalendarId);
    window.open(url.toString(), "_blank");
    showToast("In Google Kalender geöffnet");
  };
  const downloadIcal = () => {
    if (!ivDetails.date || !ivDetails.time) { showToast("Bitte zuerst Termin erfassen", "error"); return; }
    const timeStr = ivDetails.time.replace(":", "");
    const dtStart = ivDetails.date.replace(/-/g, "") + "T" + timeStr + "00";
    const endDt   = new Date(`${ivDetails.date}T${ivDetails.time}:00`);
    endDt.setMinutes(endDt.getMinutes() + (ivDetails.duration ?? 60));
    const dtEnd = endDt.getFullYear().toString() + String(endDt.getMonth()+1).padStart(2,"0") +
      String(endDt.getDate()).padStart(2,"0") + "T" +
      String(endDt.getHours()).padStart(2,"0") + String(endDt.getMinutes()).padStart(2,"0") + "00";
    const loc  = ivDetails.format === "onsite" ? (ivDetails.location ?? "") : (ivDetails.videoUrl ?? "");
    const desc = [
      `Interview Runde ${ivRound}`,
      ivDetails.videoProvider ? `Anbieter: ${ivDetails.videoProvider}` : "",
      ivDetails.videoCode     ? `Meeting-Code: ${ivDetails.videoCode}` : "",
      ivDetails.interviewer   ? `Gesprächspartner: ${ivDetails.interviewer}` : "",
      ivDetails.notes         ? `Notizen: ${ivDetails.notes}` : "",
    ].filter(Boolean).join("\\n");
    const lines = [
      "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Application Pal//Interview//DE",
      "BEGIN:VEVENT",
      `DTSTART:${dtStart}`, `DTEND:${dtEnd}`,
      `SUMMARY:Interview ${ivRound}: ${app.role} @ ${app.company}`,
      loc ? `LOCATION:${loc}` : "",
      `DESCRIPTION:${desc}`,
      `UID:interview-${app.id}-${ivRound}@application-pal`,
      "END:VEVENT","END:VCALENDAR",
    ].filter(Boolean).join("\r\n");
    const blob = new Blob([lines], { type: "text/calendar;charset=utf-8" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = `interview-${app.company.replace(/[^a-z0-9]/gi, "-")}-runde${ivRound}.ics`;
    a.click(); URL.revokeObjectURL(a.href);
    showToast("iCal heruntergeladen");
  };

  const aiBody = { ai: { provider: ai.provider, anthropicApiKey: ai.anthropicApiKey, lmStudioUrl: ai.lmStudioUrl, lmStudioModel: ai.lmStudioModel } };

  const run = async (key: string, fn: () => Promise<void>) => {
    if (ai.provider === "none") { setErr("KI-Modell in Settings konfigurieren"); return; }
    setErr(null); setLoading(key);
    try {
      await fn();
      setResultTimes(prev => ({ ...prev, [key]: new Date() }));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Fehler";
      setErr(msg);
    } finally { setLoading(null); }
  };

  const AiBtn = ({ id, label, icon }: { id: string; label: string; icon: React.ReactNode }) => {
    const ts = resultTimes[id];
    const tsLabel = ts ? ts.toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : undefined;
    return (
    <button className="btn btn-secondary" style={{
      fontSize: 10, padding: "10px 8px", minHeight: 58,
      flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 0, position: "relative", whiteSpace: "normal",
    }} disabled={!!loading}
      title={ts && tsLabel ? `Erstellt: ${tsLabel}` : undefined}
      onClick={() => run(id, async () => {
        if (id === "cv-doc") {
          const r = await api.post<{ docUrl?: string }>(`/api/applications/${app.id}/ai/cv-doc`, aiBody);
          if (r.data.docUrl) window.open(r.data.docUrl, "_blank");
          else setErr("Google Drive nicht verbunden. Bitte in Settings → Integrationen verbinden.");
        } else if (id === "cv-highlights") {
          const r = await api.post<CvHighlights>(`/api/applications/${app.id}/ai/cv-highlights`, aiBody);
          updateCvHighlights(r.data);
        } else if (id === "cover-letter") {
          const r = await api.post<EmailDraft & { docUrl?: string }>(`/api/applications/${app.id}/ai/cover-letter`, aiBody);
          setEmailModal({ subject: r.data.subject, body: r.data.body });
        } else if (id === "cover-letter-doc") {
          const r = await api.post<EmailDraft & { docUrl?: string }>(`/api/applications/${app.id}/ai/cover-letter`, { ...aiBody, createDoc: true });
          if (r.data.docUrl) window.open(r.data.docUrl, "_blank");
        } else if (id === "email-app") {
          const r = await api.post<EmailDraft>(`/api/applications/${app.id}/ai/email-draft`, { ...aiBody, type: "application" });
          setEmailModal(r.data);
        } else if (id === "email-follow") {
          const r = await api.post<EmailDraft>(`/api/applications/${app.id}/ai/email-draft`, { ...aiBody, type: "followup" });
          setEmailModal(r.data);
        } else if (id === "email-decline") {
          const r = await api.post<EmailDraft>(`/api/applications/${app.id}/ai/email-draft`, { ...aiBody, type: "decline" });
          setEmailModal(r.data);
        } else if (id === "interview-prep") {
          const r = await api.post<InterviewPrep>(`/api/applications/${app.id}/ai/interview-prep`, aiBody);
          updateInterviewPrep(r.data);
          // Persist to DB so it survives page reload
          const prepField = stage === "interview_1" ? "interview1Prep" : "interview2Prep";
          onSave?.({ [prepField]: JSON.stringify(r.data) } as Partial<Application>);
        } else if (id === "salary-tips") {
          const r = await api.post<SalaryTips>(`/api/applications/${app.id}/ai/salary-tips`, aiBody);
          updateSalaryTips(r.data);
        } else if (id === "glassdoor-check") {
          const r = await api.post<GlassdoorData>(`/api/applications/${app.id}/ai/glassdoor-check`, aiBody);
          updateGlassdoor(r.data);
        } else if (id === "salary-check") {
          const r = await api.post<SalaryCheck>(`/api/applications/${app.id}/ai/salary-check`, aiBody);
          updateSalaryCheck(r.data);
        } else if (id === "ats-keywords") {
          const r = await api.post<AtsKeywords>(`/api/applications/${app.id}/ai/ats-keywords`, aiBody);
          updateAtsKeywords(r.data);
        } else if (id === "company-research") {
          const r = await api.post<CompanyResearch>(`/api/applications/${app.id}/ai/company-research`, aiBody);
          updateCompanyResearch(r.data);
        } else if (id === "ackermann-script") {
          const r = await api.post<AckermannScript>(`/api/applications/${app.id}/ai/ackermann-script`, aiBody);
          updateAckermannScript(r.data);
        } else if (id === "letter-review") {
          const r = await api.post<LetterReview>(`/api/applications/${app.id}/ai/letter-review`, { ...aiBody });
          updateLetterReview(r.data);
        } else if (id === "opening-sentences") {
          const r = await api.post<OpeningSentences>(`/api/applications/${app.id}/ai/opening-sentences`, aiBody);
          updateOpeningSentences(r.data);
        } else if (id === "email-feedback") {
          const r = await api.post<EmailDraft>(`/api/applications/${app.id}/ai/email-draft`, { ...aiBody, type: "feedback" });
          setEmailModal(r.data);
        } else if (id === "email-linkedin") {
          const r = await api.post<EmailDraft>(`/api/applications/${app.id}/ai/email-draft`, { ...aiBody, type: "linkedin" });
          setEmailModal(r.data);
        } else if (id === "onboarding") {
          const r = await api.post<OnboardingChecklist>(`/api/applications/${app.id}/ai/onboarding`, aiBody);
          updateOnboarding(r.data);
        } else if (id === "kununu-check") {
          const r = await api.post<KununuData>(`/api/applications/${app.id}/ai/kununu-check`, aiBody);
          updateKununu(r.data);
        } else if (id === "linkedin-profile") {
          const r = await api.post<LinkedinData>(`/api/applications/${app.id}/ai/linkedin-profile`, aiBody);
          updateLinkedin(r.data);
        }
      })}>
      {/* Tile layout: icon + label centered, status badge top-right */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, width: "100%" }}>
        {loading === id
          ? <RefreshCircle width={13} height={13} style={{ animation: "spin 1s linear infinite" }} />
          : icon
        }
        <span style={{ textAlign: "center", lineHeight: 1.3, wordBreak: "break-word" }}>{label}</span>
      </div>
      {!loading && ts && (
        <div style={{
          position: "absolute", top: 5, right: 5,
          width: 14, height: 14, borderRadius: "50%",
          background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Check width={8} height={8} style={{ color: "#4ade80" }} />
        </div>
      )}
    </button>
    );
  };

  const showCv       = ["preparing_cv"].includes(stage);
  const showLetter   = ["preparing_letter"].includes(stage);
  const showEmail    = ["application_sent", "pending", "accepted"].includes(stage);
  const showIv       = ["interview_1", "interview_2"].includes(stage);
  const showSalary   = ["interview_2", "accepted"].includes(stage);
  const showInbox    = stage === "import_validating";
  const showRejected = stage === "rejected";

  if (!showCv && !showLetter && !showEmail && !showIv && !showSalary && !showInbox && !showRejected) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      {err && <div style={{ fontSize: 11, color: "#f87171", marginBottom: 8 }}>{err}</div>}

      {/* Inbox Phase */}
      {showInbox && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 6, marginBottom: 12 }}>
          <AiBtn id="glassdoor-check" icon={<Building width={12} height={12} />} label="Glassdoor Rating" />
          <AiBtn id="kununu-check"    icon={<Star width={12} height={12} />}     label="Kununu Rating" />
          <AiBtn id="linkedin-profile" icon={<Linkedin width={12} height={12} />} label="LinkedIn Profil" />
          <AiBtn id="salary-check"   icon={<Coins width={12} height={12} />}     label="Gehalts-Check" />
          <AiBtn id="ats-keywords"   icon={<Search width={12} height={12} />}    label="ATS-Keywords" />
        </div>
      )}

      {/* CV Phase */}
      {showCv && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 6, marginBottom: 12 }}>
          <AiBtn id="cv-highlights" icon={<BrainElectricity width={12} height={12} />} label="CV-Highlights" />
          <AiBtn id="cv-doc"        icon={<PageEdit width={12} height={12} />}          label="Google Doc aus Master-CV" />
        </div>
      )}

      {/* Letter Phase */}
      {showLetter && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 6, marginBottom: 12 }}>
          <AiBtn id="cover-letter"     icon={<PageEdit width={12} height={12} />}      label="Anschreiben generieren" />
          <AiBtn id="cover-letter-doc" icon={<Page width={12} height={12} />}          label="Als Google Doc" />
          <AiBtn id="letter-review"    icon={<ChatBubbleCheck width={12} height={12} />} label="Anschreiben reviewen" />
          <AiBtn id="opening-sentences" icon={<Spark width={12} height={12} />}        label="3 Eröffnungssätze" />
        </div>
      )}

      {/* Email Phase */}
      {showEmail && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 6, marginBottom: 12 }}>
          {stage === "application_sent" && <AiBtn id="email-app"     icon={<SendMail width={12} height={12} />}  label="Bewerbungs-Email" />}
          {(stage === "application_sent" || stage === "pending") && <AiBtn id="email-follow"   icon={<SendMail width={12} height={12} />}  label="Follow-up-Email" />}
          {(stage === "application_sent" || stage === "pending") && <AiBtn id="email-linkedin" icon={<Linkedin width={12} height={12} />}  label="LinkedIn-Vernetzung" />}
          {stage === "accepted" && <AiBtn id="email-decline" icon={<MailOut width={12} height={12} />}     label="Absage-Email" />}
          {stage === "accepted" && <AiBtn id="onboarding"    icon={<CheckCircle width={12} height={12} />} label="Onboarding-Checkliste" />}
        </div>
      )}

      {/* Pending Phase */}
      {stage === "pending" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 6, marginBottom: 12 }}>
          <AiBtn id="company-research"  icon={<Building width={12} height={12} />} label="Unternehmens-recherche" />
          <AiBtn id="ackermann-script"  icon={<Coins width={12} height={12} />}    label="Ackermann-Script" />
        </div>
      )}

      {/* Rejected Phase */}
      {showRejected && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 6, marginBottom: 12 }}>
          <AiBtn id="email-feedback" icon={<Mail width={12} height={12} />} label="Feedback-Email" />
        </div>
      )}

      {/* Interview Phase */}
      {showIv && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 6, marginBottom: interviewPrep ? 8 : 0 }}>
            <AiBtn id="interview-prep" icon={interviewPrep ? <Refresh width={12} height={12} /> : <Brain width={12} height={12} />} label={interviewPrep ? "Neu generieren" : "Interview-Vorbereitung"} />
            {showSalary && <AiBtn id="salary-tips" icon={<Coins width={12} height={12} />} label="Gehaltsverhandlung" />}
            {interviewPrep && <>
              <button className="btn btn-ghost" style={{ fontSize: 11, gap: 5 }}
                onClick={() => {
                  const sep = "═".repeat(40);
                  const text = [
                    `${sep}\nROLLENSPEZIFISCHE FRAGEN\n${sep}`,
                    interviewPrep.rollenFragen.map((q, i) => `${i + 1}. ${q}`).join("\n"),
                    `\n${sep}\nCHRIS VOSS FRAGEN\n${sep}`,
                    interviewPrep.vossFragenWhatHow.map(q => `→ ${q}`).join("\n"),
                    `\n${sep}\nSTAR-BEISPIELE\n${sep}`,
                    interviewPrep.starBeispiele.map(s => `${s.frage}\nS: ${s.situation}\nT: ${s.aufgabe}\nA: ${s.aktion}\nR: ${s.ergebnis}`).join("\n\n"),
                    `\n${sep}\nMEINE RÜCKFRAGEN\n${sep}`,
                    interviewPrep.rueckfragen.map(q => `? ${q}`).join("\n"),
                  ].join("\n");
                  copySection(text, "Alle Fragen kopiert");
                }}>
                <IcCopy width={11} height={11} /> Alles kopieren
              </button>
              <button className="btn btn-ghost" style={{ fontSize: 11, gap: 5 }}
                disabled={loading === "iv-export"}
                onClick={async () => {
                  setLoading("iv-export");
                  try {
                    const r = await api.post<{ docUrl: string }>(`/api/applications/${app.id}/ai/interview-prep/export-doc`, { interviewPrep });
                    window.open(r.data.docUrl, "_blank");
                    showToast("Google Doc erstellt & geöffnet");
                  } catch (e: unknown) {
                    const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
                    if (msg === "Unauthorized" || (e as { response?: { status?: number } })?.response?.status === 401) {
                      showToast("Session abgelaufen — bitte Seite neu laden", "error");
                    } else {
                      showToast(msg ?? "Export fehlgeschlagen", "error");
                    }
                  } finally {
                    setLoading(null);
                  }
                }}>
                {loading === "iv-export" ? <RefreshCircle width={11} height={11} style={{ animation: "spin 1s linear infinite" }} /> : <Page width={11} height={11} />}
                Als Google Doc
              </button>
            </>}
          </div>
        {/* Calendar actions — always shown for interview stages */}
        <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <button className="btn btn-secondary" style={{ fontSize: 11, gap: 5, justifyContent: "flex-start" }} onClick={openGoogleCalendar}>
            <IcCalendar width={12} height={12} /> Google Kalender
          </button>
          <button className="btn btn-secondary" style={{ fontSize: 11, gap: 5, justifyContent: "flex-start" }} onClick={downloadIcal}>
            <CalendarArrowDown width={12} height={12} /> iCal herunterladen
          </button>
        </div>
        </div>
      )}

      {emailModal && <EmailModal draft={emailModal} onClose={() => setEmailModal(null)} />}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "sticky", bottom: 16, zIndex: 20, alignSelf: "center",
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "9px 16px", borderRadius: 10,
          background: toast.type === "success" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
          border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}`,
          boxShadow: "0 4px 20px rgba(0,0,0,0.35)", backdropFilter: "blur(8px)",
          fontSize: 12, fontWeight: 500,
          color: toast.type === "success" ? "#4ade80" : "#f87171",
          animation: "fade-in 0.15s ease", pointerEvents: "none",
        }}>
          {toast.type === "success"
            ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Task Checklist ──
// ── Glassdoor Rating Panel ────────────────────────────────────
function GlassdoorPanel({ data, appId, onChange }: {
  data: GlassdoorData;
  appId: string;
  onChange: (v: GlassdoorData) => void;
}) {
  const [editUrl, setEditUrl] = useState(data.glassdoorUrl ?? "");
  const [saving,  setSaving]  = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.patch<GlassdoorData>(`/api/applications/${appId}/ai/glassdoor-check`, { glassdoorUrl: editUrl || undefined });
      onChange(r.data);
    } finally { setSaving(false); }
  };

  const confidenceColor = data.confidence === "hoch" ? "#34d399" : data.confidence === "mittel" ? "#fbbf24" : "#f87171";
  const stars = data.rating ? "★".repeat(Math.round(data.rating)) + "☆".repeat(5 - Math.round(data.rating)) : null;

  return (
    <div style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", padding: 14, marginBottom: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-2)" }}>Glassdoor Rating</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input type="url" value={editUrl} onChange={e => setEditUrl(e.target.value)}
            placeholder="https://www.glassdoor.com/..."
            style={{ width: 220, background: "none", border: "none", borderBottom: "1px solid var(--border)", fontSize: 10, color: "var(--fg-2)", outline: "none", padding: "2px 0", fontFamily: "var(--font-sans)" }} />
          {editUrl && (
            <a href={editUrl} target="_blank" rel="noopener noreferrer" title="Öffnen"
              style={{ display: "flex", alignItems: "center", color: "var(--fg-3)", padding: 3, borderRadius: 4, textDecoration: "none", flexShrink: 0 }}>
              <OpenNewWindow width={12} height={12} />
            </a>
          )}
          <button onClick={save} disabled={saving} title="Speichern"
            style={{ display: "flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", color: saving ? "var(--fg-4)" : "var(--fg-3)", padding: 3, borderRadius: 4, flexShrink: 0 }}>
            {saving ? <RefreshCircle width={12} height={12} style={{ animation: "spin 1s linear infinite" }} /> : <Refresh width={12} height={12} />}
          </button>
        </div>
      </div>

      {/* Rating display */}
      <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 120, padding: "12px 14px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "var(--fg-3)", marginBottom: 4 }}>GLASSDOOR</div>
          {data.rating
            ? <><div style={{ fontSize: 28, fontWeight: 800, color: "var(--accent)", lineHeight: 1 }}>{data.rating.toFixed(1)}</div>
               <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 2 }}>{stars}</div>
               {data.reviewCount && <div style={{ fontSize: 10, color: "var(--fg-3)", marginTop: 2 }}>~{data.reviewCount} Reviews</div>}</>
            : <div style={{ fontSize: 12, color: "var(--fg-3)" }}>Keine Daten</div>}
        </div>
        {(data.ceoApproval !== null || data.recommendToFriend !== null) && (
          <div style={{ flex: 1, minWidth: 120, padding: "12px 14px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
            {data.ceoApproval !== null && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9, color: "var(--fg-3)", marginBottom: 2 }}>CEO-ZUSTIMMUNG</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg-1)" }}>{data.ceoApproval}%</div>
              </div>
            )}
            {data.recommendToFriend !== null && (
              <div>
                <div style={{ fontSize: 9, color: "var(--fg-3)", marginBottom: 2 }}>WÜRDEN EMPFEHLEN</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg-1)" }}>{data.recommendToFriend}%</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary */}
      {data.summary && <div style={{ fontSize: 12, color: "var(--fg-2)", lineHeight: 1.6, marginBottom: 12 }}>{data.summary}</div>}

      {/* Pros / Cons */}
      {(data.pros?.length > 0 || data.cons?.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          {data.pros?.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#34d399", textTransform: "uppercase", marginBottom: 5 }}>Positiv</div>
              {data.pros.map((p, i) => <div key={i} style={{ fontSize: 11, color: "var(--fg-1)", padding: "2px 0" }}>+ {p}</div>)}
            </div>
          )}
          {data.cons?.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#f87171", textTransform: "uppercase", marginBottom: 5 }}>Kritisch</div>
              {data.cons.map((c, i) => <div key={i} style={{ fontSize: 11, color: "var(--fg-1)", padding: "2px 0" }}>− {c}</div>)}
            </div>
          )}
        </div>
      )}

      {/* Confidence + Hinweis */}
      <div style={{ marginTop: 8, fontSize: 10, color: "var(--fg-3)" }}>
        <span style={{ color: confidenceColor, fontWeight: 600 }}>Konfidenz: {data.confidence}</span>
        {data.hinweis && <span> · {data.hinweis}</span>}
      </div>
    </div>
  );
}

function TaskChecklist({ app }: { app: Application }) {
  const { data: tasks = [], refetch } = useQuery<Task[]>({
    queryKey: ["tasks", app.id],
    queryFn: () => api.get(`/api/applications/${app.id}/tasks`).then(r => r.data)
  });
  const [addText, setAddText] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const stageTasks = tasks.filter(t => t.stage === app.stage);
  const done = stageTasks.filter(t => t.done).length;
  const total = stageTasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const color = pct === 100 ? "#34d399" : pct >= 50 ? "#fbbf24" : "var(--accent)";

  const toggle = async (t: Task) => {
    await api.patch(`/api/applications/${app.id}/tasks/${t.id}`, { done: !t.done });
    refetch();
  };
  const del = async (t: Task) => {
    await api.delete(`/api/applications/${app.id}/tasks/${t.id}`);
    refetch();
  };
  const addTask = async () => {
    if (!addText.trim()) return;
    await api.post(`/api/applications/${app.id}/tasks`, { stage: app.stage, title: addText.trim(), isDefault: false });
    setAddText(""); setShowAdd(false); refetch();
  };

  useEffect(() => { if (showAdd) inputRef.current?.focus(); }, [showAdd]);

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Aufgaben
        </div>
        {total > 0 && (
          <span style={{
            padding: "1px 7px", borderRadius: 999, fontSize: 10, fontWeight: 700,
            background: pct === 100 ? "rgba(52,211,153,0.15)" : "var(--surface)",
            color: pct === 100 ? "#34d399" : "var(--fg-3)",
            border: `1px solid ${pct === 100 ? "rgba(52,211,153,0.3)" : "var(--border)"}`
          }}>
            {done} / {total}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div style={{ height: 2, borderRadius: 999, background: "var(--border)", marginBottom: 8, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 999, transition: "width 0.4s ease" }} />
        </div>
      )}

      {/* Task list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {stageTasks.length === 0 && !showAdd && (
          <div style={{ fontSize: 12, color: "var(--fg-3)", padding: "6px 0" }}>Keine Aufgaben für diese Phase</div>
        )}
        {stageTasks.map((t) => (
          <div key={t.id} className="task-row" style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
            {/* Underline-style checkbox */}
            <button
              onClick={() => toggle(t)}
              style={{
                width: 16, height: 16, flexShrink: 0, cursor: "pointer",
                background: "none", border: "none", padding: 0,
                display: "flex", alignItems: "flex-end", justifyContent: "center",
                borderBottom: `1.5px solid ${t.done ? "#34d399" : "var(--border)"}`,
                transition: "border-color 0.15s"
              }}>
              {t.done && <Check width={10} height={10} style={{ color: "#34d399", marginBottom: 1 }} />}
            </button>
            <span style={{ flex: 1, fontSize: 12.5, color: t.done ? "var(--fg-3)" : "var(--fg-1)", textDecoration: t.done ? "line-through" : "none", transition: "all 0.15s" }}>
              {t.title}
            </span>
            <button className="btn btn-ghost btn-icon task-del" style={{ padding: 2, opacity: 0 }} onClick={() => del(t)}>
              <Trash width={11} height={11} />
            </button>
          </div>
        ))}

        {/* Inline add */}
        {showAdd && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
            <div style={{ width: 16, height: 16, flexShrink: 0, borderBottom: "1.5px solid var(--border)" }} />
            <input
              ref={inputRef}
              value={addText}
              onChange={e => setAddText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addTask(); if (e.key === "Escape") setShowAdd(false); }}
              onBlur={() => { if (!addText.trim()) setShowAdd(false); }}
              placeholder="Neue Aufgabe…"
              style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 13, color: "var(--fg-1)", fontFamily: "var(--font-sans)" }}
            />
          </div>
        )}
      </div>

      {/* Add button */}
      <button
        onClick={() => setShowAdd(true)}
        style={{ marginTop: 8, fontSize: 11, color: "var(--fg-3)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", display: "flex", alignItems: "center", gap: 4, padding: "2px 0" }}
      >
        <Plus width={11} height={11} /> Aufgabe hinzufügen
      </button>
    </div>
  );
}

// ── Interview Details Panel ──────────────────────────────────
type InterviewDetails = {
  date?: string; time?: string; duration?: number;
  format?: "onsite" | "video" | "phone";
  location?: string; videoUrl?: string; videoCode?: string; videoProvider?: string;
  interviewer?: string; notes?: string;
};
const VIDEO_PROVIDERS = ["Zoom", "Microsoft Teams", "Google Meet", "Webex", "Andere"];
const DURATIONS = [30, 45, 60, 90, 120];

function InterviewDetailsPanel({ app, round, onSave, expanded, onToggleExpand }: {
  app: Application; round: 1 | 2; onSave: (patch: Partial<Application>) => void;
  expanded?: boolean; onToggleExpand?: () => void;
}) {
  const field = round === 1 ? "interview1Details" : "interview2Details";
  const raw = round === 1 ? app.interview1Details : app.interview2Details;
  const [details, setDetails] = useState<InterviewDetails>(() => {
    try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  });

  // Sync if app prop changes (e.g. refetch)
  const prevRaw = useRef(raw);
  useEffect(() => {
    if (prevRaw.current !== raw) {
      prevRaw.current = raw;
      try { setDetails(raw ? JSON.parse(raw) : {}); } catch { setDetails({}); }
    }
  }, [raw]);

  const save = (patch: Partial<InterviewDetails>) => {
    const updated = { ...details, ...patch };
    setDetails(updated);
    onSave({ [field]: JSON.stringify(updated) } as Partial<Application>);
  };

  const inp: React.CSSProperties = { background: "none", border: "none", borderBottom: "1px solid var(--border)", padding: "3px 0", fontSize: 12, color: "var(--fg-1)", fontFamily: "var(--font-sans)", width: "100%", outline: "none" };
  const lbl: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 };
  const fmtBtn = (val: InterviewDetails["format"], icon: React.ReactNode, label: string) => (
    <button type="button" onClick={() => save({ format: val })} style={{
      padding: "4px 10px", borderRadius: 6, border: `1px solid ${details.format === val ? "var(--accent)" : "var(--border)"}`,
      background: details.format === val ? "rgba(var(--accent-rgb,99,102,241),0.1)" : "none",
      color: details.format === val ? "var(--accent)" : "var(--fg-2)",
      fontSize: 11, cursor: "pointer", fontFamily: "var(--font-sans)", fontWeight: details.format === val ? 600 : 400,
      display: "inline-flex", alignItems: "center", gap: 4
    }}>{icon}{label}</button>
  );

  return (
    <div style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", padding: 14, marginBottom: 16, ...(expanded ? { flex: 1, overflow: "auto" } : {}) }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Interview {round} — Termin
        </div>
        {onToggleExpand && (
          <button onClick={onToggleExpand} title={expanded ? "Minimieren" : "Maximieren"} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", display: "flex", padding: 2 }}>
            {expanded ? <Collapse width={13} height={13} /> : <Expand width={13} height={13} />}
          </button>
        )}
      </div>

      {/* Date / Time / Duration row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={lbl}>Datum</div>
          <input type="date" value={details.date ?? ""} style={inp}
            onChange={e => setDetails(d => ({ ...d, date: e.target.value }))}
            onBlur={e => save({ date: e.target.value || undefined })} />
        </div>
        <div>
          <div style={lbl}>Uhrzeit</div>
          <input type="time" value={details.time ?? ""} style={inp}
            onChange={e => setDetails(d => ({ ...d, time: e.target.value }))}
            onBlur={e => save({ time: e.target.value || undefined })} />
        </div>
        <div>
          <div style={lbl}>Dauer</div>
          <select value={details.duration ?? 60} style={{ ...inp, cursor: "pointer" }}
            onChange={e => save({ duration: Number(e.target.value) })}>
            {DURATIONS.map(d => <option key={d} value={d}>{d} Min</option>)}
          </select>
        </div>
      </div>

      {/* Format */}
      <div style={{ marginBottom: 14 }}>
        <div style={lbl}>Format</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {fmtBtn("onsite", <MapPin width={11} height={11} />, "Vor Ort")}
          {fmtBtn("video", <VideoCamera width={11} height={11} />, "Video")}
          {fmtBtn("phone", <Phone width={11} height={11} />, "Telefon")}
        </div>
      </div>

      {/* Location (onsite) */}
      {details.format === "onsite" && (
        <div style={{ marginBottom: 14 }}>
          <div style={lbl}>Adresse</div>
          <input type="text" value={details.location ?? ""} placeholder="Bahnhofstrasse 1, 8001 Zürich" style={inp}
            onChange={e => setDetails(d => ({ ...d, location: e.target.value }))}
            onBlur={e => save({ location: e.target.value || undefined })} />
        </div>
      )}

      {/* Video fields */}
      {details.format === "video" && (
        <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={lbl}>Anbieter</div>
            <select value={details.videoProvider ?? ""} style={{ ...inp, cursor: "pointer" }}
              onChange={e => save({ videoProvider: e.target.value || undefined })}>
              <option value="">— Auswählen —</option>
              {VIDEO_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
            <div>
              <div style={lbl}>Meeting-URL</div>
              <input type="url" value={details.videoUrl ?? ""} placeholder="https://zoom.us/j/..." style={inp}
                onChange={e => setDetails(d => ({ ...d, videoUrl: e.target.value }))}
                onBlur={e => save({ videoUrl: e.target.value || undefined })} />
            </div>
            <div style={{ minWidth: 110 }}>
              <div style={lbl}>Meeting-Code</div>
              <input type="text" value={details.videoCode ?? ""} placeholder="123 456" style={inp}
                onChange={e => setDetails(d => ({ ...d, videoCode: e.target.value }))}
                onBlur={e => save({ videoCode: e.target.value || undefined })} />
            </div>
          </div>
        </div>
      )}

      {/* Interviewer */}
      <div style={{ marginBottom: 14 }}>
        <div style={lbl}>Gesprächspartner</div>
        <input type="text" value={details.interviewer ?? ""} placeholder="Max Muster (HR), Anna Schmidt (Fachteam)" style={inp}
          onChange={e => setDetails(d => ({ ...d, interviewer: e.target.value }))}
          onBlur={e => save({ interviewer: e.target.value || undefined })} />
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 14 }}>
        <div style={lbl}>Notizen</div>
        <textarea value={details.notes ?? ""} placeholder="Portfolio mitbringen, Laptop vorbereiten…" rows={2}
          style={{ ...inp, resize: "vertical", lineHeight: 1.5 }}
          onChange={e => setDetails(d => ({ ...d, notes: e.target.value }))}
          onBlur={e => save({ notes: e.target.value || undefined })} />
      </div>

    </div>
  );
}

function ProcessTab({ app, onSave, onAiResult }: { app: Application; onSave?: (patch: Partial<Application>) => void; onAiResult?: (id: string, data: unknown) => void }) {
  const { data: activities = [], refetch } = useQuery<ApplicationActivity[]>({
    queryKey: ["activities", app.id],
    queryFn: () => api.get(`/api/applications/${app.id}/activities`).then((r) => r.data)
  });
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState("note");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // AI-generated content — rendered full-width below the column grid
  const [aiCvHighlights,    setAiCvHighlights]    = useState<CvHighlights | null>(null);
  const [aiInterviewPrep,   setAiInterviewPrep]   = useState<InterviewPrep | null>(() => {
    const raw = app.stage === "interview_1" ? app.interview1Prep
              : app.stage === "interview_2" ? app.interview2Prep : null;
    try { return raw ? JSON.parse(raw) as InterviewPrep : null; } catch { return null; }
  });
  const [aiSalaryTips,      setAiSalaryTips]      = useState<SalaryTips | null>(null);
  const [aiSalaryCheck,     setAiSalaryCheck]     = useState<SalaryCheck | null>(null);
  const [aiAtsKeywords,     setAiAtsKeywords]     = useState<AtsKeywords | null>(null);
  const [aiCompanyResearch, setAiCompanyResearch] = useState<CompanyResearch | null>(null);
  const [aiAckermannScript, setAiAckermannScript] = useState<AckermannScript | null>(null);
  const [aiLetterReview,    setAiLetterReview]    = useState<LetterReview | null>(null);
  const [aiOpeningSentences,setAiOpeningSentences]= useState<OpeningSentences | null>(null);
  const [aiOnboarding,      setAiOnboarding]      = useState<OnboardingChecklist | null>(null);
  const [aiGlassdoor,       setAiGlassdoor]       = useState<GlassdoorData | null>(() => {
    try { return app.glassdoorData ? JSON.parse(app.glassdoorData as string) : null; } catch { return null; }
  });
  const [aiKununu,          setAiKununu]          = useState<KununuData | null>(() => {
    try { return (app as Application & { kununuData?: string }).kununuData ? JSON.parse((app as Application & { kununuData?: string }).kununuData!) : null; } catch { return null; }
  });
  const [aiLinkedin,        setAiLinkedin]        = useState<LinkedinData | null>(() => {
    try { return (app as Application & { linkedinData?: string }).linkedinData ? JSON.parse((app as Application & { linkedinData?: string }).linkedinData!) : null; } catch { return null; }
  });

  // Expand-Logik for the three content blocks
  const [interviewExpanded, setInterviewExpanded] = useState(false);
  const [aiExpanded,        setAiExpanded]        = useState(false);
  const [activitiesExpanded,setActivitiesExpanded]= useState(false);

  const expandStyle: React.CSSProperties = {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 10, background: "var(--bg)", padding: "16px 20px",
    display: "flex", flexDirection: "column", overflow: "hidden",
  };

  const add = async () => {
    if (!newTitle.trim()) return;
    await api.post(`/api/applications/${app.id}/activities`, { type: newType, title: newTitle.trim(), description: newDesc.trim() || undefined });
    setNewTitle(""); setNewDesc(""); setAdding(false); refetch();
  };

  const del = async (actId: string) => {
    await api.delete(`/api/applications/${app.id}/activities/${actId}`); refetch();
  };

  return (
    <>
      {/* Two-column: Aufgaben (left) | Aktionen (right) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start", marginBottom: 4 }}>
        <TaskChecklist app={app} />
        <StageAiActions
          app={app} onSave={onSave}
          onCvHighlightsChange={setAiCvHighlights}
          onInterviewPrepChange={setAiInterviewPrep}
          onSalaryTipsChange={setAiSalaryTips}
          onSalaryCheckChange={setAiSalaryCheck}
          onAtsKeywordsChange={setAiAtsKeywords}
          onCompanyResearchChange={setAiCompanyResearch}
          onAckermannScriptChange={setAiAckermannScript}
          onLetterReviewChange={setAiLetterReview}
          onOpeningSentencesChange={setAiOpeningSentences}
          onOnboardingChange={setAiOnboarding}
          onGlassdoorChange={setAiGlassdoor}
          onKununuChange={setAiKununu}
          onLinkedinChange={setAiLinkedin}
          onAiResult={onAiResult}
        />
      </div>

      {/* 1. Prozess-spezifische Inhalte (Interview-Termin) */}
      {(app.stage === "interview_1" || app.stage === "interview_2") && onSave && (
        <div style={interviewExpanded ? expandStyle : {}}>
          <InterviewDetailsPanel
            app={app}
            round={app.stage === "interview_1" ? 1 : 2}
            onSave={onSave}
            expanded={interviewExpanded}
            onToggleExpand={() => setInterviewExpanded(v => !v)}
          />
        </div>
      )}

      {/* 2. KI-generierte Inhalte */}
      {(aiCvHighlights || aiInterviewPrep || aiSalaryTips || aiSalaryCheck || aiAtsKeywords || aiCompanyResearch || aiAckermannScript || aiLetterReview || aiOpeningSentences || aiOnboarding) && (
        <div style={aiExpanded ? expandStyle : {}}>
          {/* Header with expand toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>KI-Inhalte</div>
            <button onClick={() => setAiExpanded(v => !v)} title={aiExpanded ? "Minimieren" : "Maximieren"}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", display: "flex", padding: 2 }}>
              {aiExpanded ? <Collapse width={13} height={13} /> : <Expand width={13} height={13} />}
            </button>
          </div>
          <div style={aiExpanded ? { flex: 1, overflow: "auto" } : {}}>
            {aiCvHighlights && (
              <div style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", padding: 14, marginBottom: 16 }}>
                <Accordion title="Besonders relevant" count={aiCvHighlights.highlights.length} color="#34d399">
                  {aiCvHighlights.highlights.map((h, i) => <div key={i} style={{ fontSize: 12, color: "var(--fg-1)", padding: "3px 0", borderBottom: i < aiCvHighlights.highlights.length - 1 ? "1px solid var(--border)" : "none" }}>✓ {h}</div>)}
                </Accordion>
                <Accordion title="Keywords Match" count={aiCvHighlights.keywords.length} color="#60a5fa">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {aiCvHighlights.keywords.map((k, i) => <span key={i} className="tag" style={{ background: "rgba(96,165,250,0.1)", color: "#60a5fa", borderColor: "rgba(96,165,250,0.3)" }}>{k}</span>)}
                  </div>
                </Accordion>
                <Accordion title="Lücken" count={aiCvHighlights.gaps.length} color="#f87171">
                  {aiCvHighlights.gaps.map((g, i) => <div key={i} style={{ fontSize: 12, color: "var(--fg-2)", padding: "3px 0" }}>⚠ {g}</div>)}
                </Accordion>
              </div>
            )}
            {aiInterviewPrep && (
              <div style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", padding: 14, marginBottom: 16 }}>
                <Accordion title="Rollenspezifische Fragen" count={aiInterviewPrep.rollenFragen.length} color="#a78bfa"
                  onCopy={() => copyText(aiInterviewPrep.rollenFragen.map((q, i) => `${i + 1}. ${q}`).join("\n"))}>
                  {aiInterviewPrep.rollenFragen.map((q, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "var(--fg-1)", padding: "5px 0", borderBottom: i < aiInterviewPrep.rollenFragen.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <span style={{ color: "var(--fg-3)", flexShrink: 0 }}>{i + 1}.</span>
                      <span style={{ flex: 1 }}>{q}</span>
                      <button onClick={() => copyText(q)} title="Kopieren" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", padding: 0, flexShrink: 0, display: "flex", alignItems: "center", opacity: 0.6 }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}>
                        <IcCopy width={10} height={10} />
                      </button>
                    </div>
                  ))}
                </Accordion>
                <Accordion title='Chris Voss "What / How"-Fragen' count={aiInterviewPrep.vossFragenWhatHow.length} color="#34d399"
                  onCopy={() => copyText(aiInterviewPrep.vossFragenWhatHow.map(q => `→ ${q}`).join("\n"))}>
                  <div style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 8, fontStyle: "italic" }}>Taktische offene Fragen nach "Never Split the Difference"</div>
                  {aiInterviewPrep.vossFragenWhatHow.map((q, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "var(--fg-1)", padding: "5px 0", borderBottom: i < aiInterviewPrep.vossFragenWhatHow.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <span style={{ color: "#34d399", flexShrink: 0 }}>→</span>
                      <span style={{ flex: 1 }}>{q}</span>
                      <button onClick={() => copyText(q)} title="Kopieren" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", padding: 0, flexShrink: 0, display: "flex", alignItems: "center", opacity: 0.6 }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}>
                        <IcCopy width={10} height={10} />
                      </button>
                    </div>
                  ))}
                </Accordion>
                <Accordion title="STAR-Beispiele" count={aiInterviewPrep.starBeispiele.length} color="#fbbf24"
                  onCopy={() => copyText(aiInterviewPrep.starBeispiele.map(s => `${s.frage}\nS: ${s.situation}\nT: ${s.aufgabe}\nA: ${s.aktion}\nR: ${s.ergebnis}`).join("\n\n"))}>
                  {aiInterviewPrep.starBeispiele.map((s, i) => (
                    <div key={i} style={{ position: "relative", marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
                      <button onClick={() => copyText(`${s.frage}\nS: ${s.situation}\nT: ${s.aufgabe}\nA: ${s.aktion}\nR: ${s.ergebnis}`)} title="Kopieren"
                        style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", padding: 0, display: "flex", alignItems: "center", opacity: 0.6 }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}>
                        <IcCopy width={11} height={11} />
                      </button>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-1)", marginBottom: 6, paddingRight: 20 }}>❓ {s.frage}</div>
                      {[["S", s.situation], ["T", s.aufgabe], ["A", s.aktion], ["R", s.ergebnis]].map(([k, v]) => (
                        <div key={k} style={{ fontSize: 11, color: "var(--fg-2)", padding: "2px 0" }}>
                          <span style={{ fontWeight: 700, color: "#fbbf24", marginRight: 6 }}>{k}:</span>{v}
                        </div>
                      ))}
                    </div>
                  ))}
                </Accordion>
                <Accordion title="Meine Rückfragen" count={aiInterviewPrep.rueckfragen.length} color="#60a5fa"
                  onCopy={() => copyText(aiInterviewPrep.rueckfragen.map(q => `? ${q}`).join("\n"))}>
                  {aiInterviewPrep.rueckfragen.map((q, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "var(--fg-1)", padding: "5px 0", borderBottom: i < aiInterviewPrep.rueckfragen.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <span style={{ color: "#60a5fa", flexShrink: 0 }}>?</span>
                      <span style={{ flex: 1 }}>{q}</span>
                      <button onClick={() => copyText(q)} title="Kopieren" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", padding: 0, flexShrink: 0, display: "flex", alignItems: "center", opacity: 0.6 }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}>
                        <IcCopy width={10} height={10} />
                      </button>
                    </div>
                  ))}
                </Accordion>
              </div>
            )}
            {aiSalaryTips && (
              <div style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "var(--fg-2)", marginBottom: 10, lineHeight: 1.6 }}>{aiSalaryTips["markteinschätzung"]}</div>
                <Accordion title="Taktiken" count={aiSalaryTips.taktiken.length} color="#34d399">
                  {aiSalaryTips.taktiken.map((t, i) => <div key={i} style={{ fontSize: 12, color: "var(--fg-1)", padding: "3px 0" }}>• {t}</div>)}
                </Accordion>
                <Accordion title="Formulierungen" count={aiSalaryTips.formulierungen.length} color="#60a5fa">
                  {aiSalaryTips.formulierungen.map((f, i) => <div key={i} style={{ fontSize: 12, color: "var(--fg-1)", padding: "4px 0", fontStyle: "italic", borderBottom: i < aiSalaryTips.formulierungen.length - 1 ? "1px solid var(--border)" : "none" }}>„{f}"</div>)}
                </Accordion>
                <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.2)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#34d399", marginBottom: 4 }}>Chris Voss Anker-Taktik</div>
                  <div style={{ fontSize: 12, color: "var(--fg-1)", lineHeight: 1.6 }}>{aiSalaryTips.vossAnker}</div>
                </div>
              </div>
            )}

            {/* Glassdoor Rating panel */}
            {aiGlassdoor && <GlassdoorPanel data={aiGlassdoor} appId={app.id} onChange={setAiGlassdoor} />}

            {/* Salary Check panel */}
            {aiSalaryCheck && (
              <div style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", padding: 14, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-2)" }}>Gehalts-Check Schweiz</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 11, gap: 4 }}
                      onClick={() => copyText(`Lohnband: ${aiSalaryCheck.waehrung} ${aiSalaryCheck.lohnband.min.toLocaleString()}–${aiSalaryCheck.lohnband.max.toLocaleString()} (Median: ${aiSalaryCheck.lohnband.median.toLocaleString()})\n\n${aiSalaryCheck.begruendung}`)}>
                      <IcCopy width={11} height={11} /> Kopieren
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 11, gap: 4 }}
                      onClick={async () => {
                        const r = await api.post<{ docUrl: string }>(`/api/applications/${app.id}/ai/salary-check/export-doc`, { salaryCheck: aiSalaryCheck });
                        window.open(r.data.docUrl, "_blank");
                      }}>
                      <Page width={11} height={11} /> Google Doc
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                  <div style={{ textAlign: "center", flex: 1, padding: 12, borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 10, color: "var(--fg-3)", marginBottom: 4 }}>MINIMUM</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "var(--fg-1)" }}>CHF {aiSalaryCheck.lohnband.min.toLocaleString()}</div>
                  </div>
                  <div style={{ textAlign: "center", flex: 1, padding: 12, borderRadius: 8, background: "var(--accent-08)", border: "1px solid var(--accent)" }}>
                    <div style={{ fontSize: 10, color: "var(--accent)", marginBottom: 4, fontWeight: 700 }}>MEDIAN</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "var(--accent)" }}>CHF {aiSalaryCheck.lohnband.median.toLocaleString()}</div>
                  </div>
                  <div style={{ textAlign: "center", flex: 1, padding: 12, borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 10, color: "var(--fg-3)", marginBottom: 4 }}>MAXIMUM</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "var(--fg-1)" }}>CHF {aiSalaryCheck.lohnband.max.toLocaleString()}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--fg-2)", lineHeight: 1.6, marginBottom: 10 }}>{aiSalaryCheck.begruendung}</div>
                {aiSalaryCheck.faktoren.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {aiSalaryCheck.faktoren.map((f, i) => <span key={i} className="tag">{f}</span>)}
                  </div>
                )}
              </div>
            )}

            {/* ATS Keywords panel */}
            {aiAtsKeywords && (
              <div style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", padding: 14, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-2)" }}>ATS-Keywords</div>
                  <button className="btn btn-ghost" style={{ fontSize: 11, gap: 4 }}
                    onClick={() => copyText([
                      "MUST-HAVE:\n" + aiAtsKeywords.mustHave.join(", "),
                      "NICE-TO-HAVE:\n" + aiAtsKeywords.niceToHave.join(", "),
                      "SOFT SKILLS:\n" + aiAtsKeywords.softSkills.join(", "),
                      "TOOLS:\n" + aiAtsKeywords.tools.join(", "),
                    ].join("\n\n"))}>
                    <IcCopy width={11} height={11} /> Kopieren
                  </button>
                </div>
                {[
                  { label: "Must-Have", items: aiAtsKeywords.mustHave, color: "#f87171" },
                  { label: "Nice-to-Have", items: aiAtsKeywords.niceToHave, color: "#fbbf24" },
                  { label: "Soft Skills", items: aiAtsKeywords.softSkills, color: "#34d399" },
                  { label: "Tools", items: aiAtsKeywords.tools, color: "#60a5fa" },
                ].filter(g => g.items.length > 0).map(group => (
                  <div key={group.label} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: group.color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>{group.label}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {group.items.map((k, i) => <span key={i} className="tag" style={{ background: `${group.color}15`, color: group.color, borderColor: `${group.color}40` }}>{k}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Company Research panel */}
            {aiCompanyResearch && (
              <div style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", padding: 14, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-2)" }}>Unternehmensrecherche</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 11, gap: 4 }}
                      onClick={() => copyText(Object.entries(aiCompanyResearch).map(([k, v]) => `${k.toUpperCase()}:\n${Array.isArray(v) ? (v as string[]).join(", ") : v}`).join("\n\n"))}>
                      <IcCopy width={11} height={11} /> Kopieren
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 11, gap: 4 }}
                      onClick={async () => {
                        const r = await api.post<{ docUrl: string }>(`/api/applications/${app.id}/ai/company-research/export-doc`, { research: aiCompanyResearch });
                        window.open(r.data.docUrl, "_blank");
                      }}>
                      <Page width={11} height={11} /> Google Doc
                    </button>
                  </div>
                </div>
                <Accordion title="Unternehmensüberblick" count={0} color="#60a5fa">
                  <div style={{ fontSize: 12, color: "var(--fg-1)", lineHeight: 1.6 }}>{aiCompanyResearch.unternehmensueberblick}</div>
                </Accordion>
                <Accordion title="Marktposition & Kultur" count={0} color="#a78bfa">
                  <div style={{ fontSize: 12, color: "var(--fg-1)", lineHeight: 1.6, marginBottom: 8 }}>{aiCompanyResearch.marktposition}</div>
                  <div style={{ fontSize: 12, color: "var(--fg-2)", lineHeight: 1.6 }}>{aiCompanyResearch.unternehmenskultur}</div>
                </Accordion>
                {aiCompanyResearch.wettbewerber.length > 0 && (
                  <Accordion title="Wettbewerber" count={aiCompanyResearch.wettbewerber.length} color="#fbbf24">
                    {aiCompanyResearch.wettbewerber.map((w, i) => <div key={i} style={{ fontSize: 12, color: "var(--fg-1)", padding: "3px 0" }}>• {w}</div>)}
                  </Accordion>
                )}
                {aiCompanyResearch.aktuelleThemen.length > 0 && (
                  <Accordion title="Aktuelle Themen" count={aiCompanyResearch.aktuelleThemen.length} color="#34d399">
                    {aiCompanyResearch.aktuelleThemen.map((t, i) => <div key={i} style={{ fontSize: 12, color: "var(--fg-1)", padding: "3px 0" }}>• {t}</div>)}
                  </Accordion>
                )}
                {aiCompanyResearch.gespraechsthemen.length > 0 && (
                  <Accordion title="Gesprächsthemen fürs Interview" count={aiCompanyResearch.gespraechsthemen.length} color="#f87171">
                    {aiCompanyResearch.gespraechsthemen.map((t, i) => <div key={i} style={{ fontSize: 12, color: "var(--fg-1)", padding: "5px 0" }}>💡 {t}</div>)}
                  </Accordion>
                )}
              </div>
            )}

            {/* Ackermann Script panel */}
            {aiAckermannScript && (
              <div style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", padding: 14, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-2)" }}>Ackermann-Verhandlungs-Script</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 11, gap: 4 }}
                      onClick={() => copyText(`ZIELGEHALT: CHF ${aiAckermannScript.zielgehalt.toLocaleString()}\nANKERGEBOT: CHF ${aiAckermannScript.ankergebot.toLocaleString()}\n\n` +
                        aiAckermannScript.schritte.map(s => `Runde ${s.runde} (CHF ${s.angebot.toLocaleString()}):\n"${s.formulierung}"\nTaktik: ${s.taktik}`).join("\n\n") +
                        `\n\nCHRIS VOSS ANKER:\n${aiAckermannScript.vossAnker}`)}>
                      <IcCopy width={11} height={11} /> Kopieren
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 11, gap: 4 }}
                      onClick={async () => {
                        const r = await api.post<{ docUrl: string }>(`/api/applications/${app.id}/ai/ackermann-script/export-doc`, { script: aiAckermannScript });
                        window.open(r.data.docUrl, "_blank");
                      }}>
                      <Page width={11} height={11} /> Google Doc
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                  <div style={{ flex: 1, padding: 10, borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "var(--fg-3)", marginBottom: 3 }}>ZIELGEHALT</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "var(--accent)" }}>CHF {aiAckermannScript.zielgehalt.toLocaleString()}</div>
                  </div>
                  <div style={{ flex: 1, padding: 10, borderRadius: 8, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)", textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "#fbbf24", marginBottom: 3 }}>ANKERLOHN (65%)</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#fbbf24" }}>CHF {aiAckermannScript.ankergebot.toLocaleString()}</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  {aiAckermannScript.schritte.map((s, i) => (
                    <div key={i} style={{ padding: "10px 12px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase" }}>Runde {s.runde}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--fg-1)" }}>CHF {s.angebot.toLocaleString()}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--fg-1)", fontStyle: "italic", marginBottom: 4 }}>„{s.formulierung}"</div>
                      <div style={{ fontSize: 11, color: "var(--fg-3)" }}>🧠 {s.taktik}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.2)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#34d399", marginBottom: 4 }}>CHRIS VOSS ANKER-FORMULIERUNG</div>
                  <div style={{ fontSize: 12, color: "var(--fg-1)", lineHeight: 1.6 }}>{aiAckermannScript.vossAnker}</div>
                </div>
                {aiAckermannScript.nichtmonetaer.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", marginBottom: 6 }}>Nicht-monetäre Alternativen</div>
                    {aiAckermannScript.nichtmonetaer.map((n, i) => <div key={i} style={{ fontSize: 12, color: "var(--fg-2)", padding: "2px 0" }}>• {n}</div>)}
                  </div>
                )}
              </div>
            )}

            {/* Letter Review panel */}
            {aiLetterReview && (
              <div style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", padding: 14, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-2)" }}>Anschreiben-Review</div>
                  <button className="btn btn-ghost" style={{ fontSize: 11, gap: 4 }}
                    onClick={() => copyText(`${aiLetterReview.gesamteindruck}\n\nStärken:\n${aiLetterReview.staerken.map(s => `• ${s}`).join("\n")}\n\nVerbesserungen:\n${aiLetterReview.verbesserungen.map(v => `• ${v}`).join("\n")}`)}>
                    <IcCopy width={11} height={11} /> Kopieren
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <span className="tag" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>Tonalität: {aiLetterReview.tonalitaet}</span>
                  <span className="tag" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>Länge: {aiLetterReview.laenge}</span>
                  <span className="tag" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>Personalisierung: {aiLetterReview.personalisierung}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--fg-2)", lineHeight: 1.6, marginBottom: 12 }}>{aiLetterReview.gesamteindruck}</div>
                <Accordion title="Stärken" count={aiLetterReview.staerken.length} color="#34d399">
                  {aiLetterReview.staerken.map((s, i) => <div key={i} style={{ fontSize: 12, color: "var(--fg-1)", padding: "3px 0" }}>✓ {s}</div>)}
                </Accordion>
                <Accordion title="Verbesserungen" count={aiLetterReview.verbesserungen.length} color="#fbbf24">
                  {aiLetterReview.verbesserungen.map((v, i) => <div key={i} style={{ fontSize: 12, color: "var(--fg-1)", padding: "3px 0" }}>→ {v}</div>)}
                </Accordion>
                {aiLetterReview.cliches.length > 0 && (
                  <Accordion title="Clichés / Floskeln" count={aiLetterReview.cliches.length} color="#f87171">
                    {aiLetterReview.cliches.map((c, i) => <div key={i} style={{ fontSize: 12, color: "#f87171", padding: "3px 0" }}>⚠ {c}</div>)}
                  </Accordion>
                )}
              </div>
            )}

            {/* Opening Sentences panel */}
            {aiOpeningSentences && (
              <div style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-2)", marginBottom: 12 }}>3 Eröffnungssätze</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {aiOpeningSentences.saetze.map((s, i) => (
                    <div key={i} style={{ padding: "10px 12px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", marginBottom: 4 }}>{s.ansatz}</div>
                          <div style={{ fontSize: 12, color: "var(--fg-1)", lineHeight: 1.5, marginBottom: 4 }}>„{s.satz}"</div>
                          <div style={{ fontSize: 11, color: "var(--fg-3)" }}>{s.erklaerung}</div>
                        </div>
                        <button onClick={() => copyText(s.satz)} title="Kopieren"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", padding: 2, flexShrink: 0 }}>
                          <IcCopy width={10} height={10} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Onboarding Checklist panel */}
            {aiOnboarding && (
              <div style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", padding: 14, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-2)" }}>Onboarding-Checkliste</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 11, gap: 4 }}
                      onClick={() => copyText(`Erste 30 Tage:\n${aiOnboarding.erste30Tage.map(t => `• ${t}`).join("\n")}\n\nErste 60 Tage:\n${aiOnboarding.erste60Tage.map(t => `• ${t}`).join("\n")}\n\nErste 90 Tage:\n${aiOnboarding.erste90Tage.map(t => `• ${t}`).join("\n")}`)}>
                      <IcCopy width={11} height={11} /> Kopieren
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 11, gap: 4 }}
                      onClick={async () => {
                        const r = await api.post<{ docUrl: string }>(`/api/applications/${app.id}/ai/onboarding/export-doc`, { checklist: aiOnboarding });
                        window.open(r.data.docUrl, "_blank");
                      }}>
                      <Page width={11} height={11} /> Google Doc
                    </button>
                  </div>
                </div>
                {[
                  { label: "Erste 30 Tage", items: aiOnboarding.erste30Tage, color: "#60a5fa" },
                  { label: "Erste 60 Tage", items: aiOnboarding.erste60Tage, color: "#a78bfa" },
                  { label: "Erste 90 Tage", items: aiOnboarding.erste90Tage, color: "#34d399" },
                ].map(phase => (
                  <Accordion key={phase.label} title={phase.label} count={phase.items.length} color={phase.color}>
                    {phase.items.map((item, i) => <div key={i} style={{ fontSize: 12, color: "var(--fg-1)", padding: "3px 0" }}>☐ {item}</div>)}
                  </Accordion>
                ))}
                {aiOnboarding.allgemein.length > 0 && (
                  <Accordion title="Allgemein" count={aiOnboarding.allgemein.length} color="#fbbf24">
                    {aiOnboarding.allgemein.map((item, i) => <div key={i} style={{ fontSize: 12, color: "var(--fg-1)", padding: "3px 0" }}>• {item}</div>)}
                  </Accordion>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Aktivitäten */}
      <div style={activitiesExpanded ? expandStyle : {}}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Aktivitäten</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-secondary" style={{ fontSize: 11, gap: 4, padding: "4px 8px" }} onClick={() => setAdding((v) => !v)}>
              <Plus width={11} height={11} /> Aktivität
            </button>
            <button onClick={() => setActivitiesExpanded(v => !v)} title={activitiesExpanded ? "Minimieren" : "Maximieren"}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", display: "flex", padding: 4 }}>
              {activitiesExpanded ? <Collapse width={13} height={13} /> : <Expand width={13} height={13} />}
            </button>
          </div>
        </div>

      {adding && (
        <div style={{ padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", marginBottom: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ACTIVITY_TYPES.map((t) => (
              <button key={t.id} onClick={() => setNewType(t.id)}
                style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)",
                  background: newType === t.id ? "var(--accent-08)" : "transparent",
                  color: newType === t.id ? "var(--accent)" : "var(--fg-2)",
                  borderColor: newType === t.id ? "var(--accent)" : "var(--border)" }}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="field" style={{ margin: 0 }}>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Titel…" autoFocus onKeyDown={(e) => e.key === "Enter" && add()} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Beschreibung (optional)…" />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-secondary" onClick={() => setAdding(false)}>Abbrechen</button>
            <button className="btn btn-primary" onClick={add}>Hinzufügen</button>
          </div>
        </div>
      )}

      {activities.length === 0 && (
        <div style={{ color: "var(--fg-3)", fontSize: 12, textAlign: "center", padding: "24px 0", border: "1px dashed var(--border)", borderRadius: 8 }}>
          Noch keine Aktivitäten.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column" }}>
        {activities.map((act, i) => (
          <div key={act.id} style={{ display: "flex", gap: 12, paddingBottom: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent-08)", border: "1px solid var(--accent-15)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", flexShrink: 0 }}>
                {ACTIVITY_ICONS[act.type] ?? <ChatBubbleEmpty width={13} height={13} />}
              </div>
              {i < activities.length - 1 && <div style={{ width: 1, flex: 1, background: "var(--border-2)", marginTop: 4 }} />}
            </div>
            <div style={{ flex: 1, paddingBottom: 4 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg-1)" }}>{act.title}</div>
              {act.description && <div style={{ fontSize: 11.5, color: "var(--fg-2)", marginTop: 2 }}>{act.description}</div>}
              <div style={{ fontSize: 10.5, color: "var(--fg-3)", fontFamily: "var(--font-mono)", marginTop: 3 }}>
                {new Date(act.activityDate).toLocaleString()}
              </div>
            </div>
            <button className="btn btn-ghost btn-icon" style={{ flexShrink: 0, padding: 4 }} onClick={() => del(act.id)}><Trash width={11} height={11} /></button>
          </div>
        ))}
      </div>
      </div>  {/* end activitiesExpanded wrapper */}
    </>
  );
}

// ─── AI Agent Tab ─────────────────────────────────────────────
const MOCK_VERSIONS = [
  { id: "v3", label: "v3 · current", when: "2 min ago",  note: "More platform-eng emphasis" },
  { id: "v2", label: "v2",           when: "8 min ago",  note: "Initial draft" },
  { id: "v1", label: "v1 · base",    when: "Today",      note: "Resume base from template" },
];
const MOCK_CV_DIFF = [
  { type: "context", text: "Experienced designer with 6+ years building" },
  { type: "remove",  text: "side projects and personal tools." },
  { type: "add",     text: "developer tooling and platform infrastructure at scale." },
  { type: "context", text: "Strong Figma, UX Research, and design-systems background." },
];
type AgentDoc = "cv" | "letter";
type MatchResult = {
  score: number;
  breakdown: { fachkompetenz: number; erfahrung: number; soft_skills: number; kulturelle_passung: number };
  staerken: string[];
  luecken: string[];
  reasoning: string;
};

function ScoreRing({ score }: { score: number }) {
  const color = score >= 75 ? "#34d399" : score >= 50 ? "#fbbf24" : "#f87171";
  const r = 36; const circ = 2 * Math.PI * r;
  const progress = (score / 100) * circ;
  return (
    <div style={{ position: "relative", width: 96, height: 96, flexShrink: 0 }}>
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${progress} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 48 48)" style={{ transition: "stroke-dasharray 0.6s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 10, color: "var(--fg-3)", fontWeight: 600 }}>%</span>
      </div>
    </div>
  );
}

function MiniBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 11 }}>
        <span style={{ color: "var(--fg-2)" }}>{label}</span>
        <span style={{ fontWeight: 700, color }}>{value}%</span>
      </div>
      <div style={{ height: 5, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 999, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function AgentTab({ app }: { app: Application }) {
  const { ai } = useUiStore();
  const [running, setRunning] = useState(false);
  const [stepN, setStepN] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Parse stored match details from app
  const stored: MatchResult | null = (() => {
    if (!app.matchScore || !app.matchDetails) return null;
    try { return JSON.parse(app.matchDetails as string) as MatchResult; } catch { return null; }
  })();

  const [result, setResult] = useState<MatchResult | null>(stored);

  const runAnalysis = async () => {
    if (ai.provider === "none") {
      setError("Bitte zuerst ein KI-Modell in den Settings konfigurieren (LM Studio oder Anthropic).");
      return;
    }
    if (!app.description?.trim()) {
      setError("Keine Stellenbeschreibung vorhanden. Bitte im Tab 'Beschreibung' einfuegen.");
      return;
    }
    setError(null); setRunning(true); setStepN(0);
    const advance = (n: number) => setTimeout(() => setStepN(n), n * 700);
    advance(1); advance(2); advance(3);
    try {
      const res = await api.post<MatchResult>(`/api/applications/${app.id}/match-score`, {
        ai: { provider: ai.provider, anthropicApiKey: ai.anthropicApiKey, lmStudioUrl: ai.lmStudioUrl, lmStudioModel: ai.lmStudioModel }
      });
      setResult(res.data);
      setStepN(4);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Unbekannter Fehler";
      setError(msg);
    } finally {
      setRunning(false);
    }
  };

  const scoreColor = result ? (result.score >= 75 ? "#34d399" : result.score >= 50 ? "#fbbf24" : "#f87171") : "var(--fg-3)";

  return (
    <>
      {/* No AI warning */}
      {ai.provider === "none" && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", fontSize: 12, color: "#fbbf24", marginBottom: 14 }}>
          Kein KI-Modell konfiguriert.{" "}
          <a href="/settings" style={{ color: "inherit", fontWeight: 700 }}>Settings → AI Integration →</a>
        </div>
      )}

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.25)", fontSize: 12, color: "#f43f5e", marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Score + Bars */}
      {result ? (
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginBottom: 20 }}>
          <ScoreRing score={result.score} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: scoreColor, marginBottom: 10 }}>
              {result.score >= 75 ? "Starke Übereinstimmung" : result.score >= 50 ? "Moderate Übereinstimmung" : "Schwache Übereinstimmung"}
            </div>
            <MiniBar label="Fachkompetenz"      value={result.breakdown.fachkompetenz}      color={scoreColor} />
            <MiniBar label="Erfahrung"           value={result.breakdown.erfahrung}           color={scoreColor} />
            <MiniBar label="Soft Skills"         value={result.breakdown.soft_skills}         color={scoreColor} />
            <MiniBar label="Kulturelle Passung"  value={result.breakdown.kulturelle_passung}  color={scoreColor} />
          </div>
        </div>
      ) : !running && (
        <div style={{ textAlign: "center", padding: "24px 0", color: "var(--fg-3)", fontSize: 13, marginBottom: 16 }}>
          Noch keine Analyse vorhanden
        </div>
      )}

      {/* Live steps */}
      {running && (
        <div className="card" style={{ background: "var(--surface-2)", padding: 14, marginBottom: 14 }}>
          <AgentStep done={stepN >= 1} active={stepN === 0} label="Profil laden" meta="Master-CV · Dokumente · Stichpunkte" />
          <AgentStep done={stepN >= 2} active={stepN === 1} label="Stellenbeschreibung analysieren" meta="Anforderungen · Skills · Kontext" />
          <AgentStep done={stepN >= 3} active={stepN === 2} label="Abgleich berechnen" meta="Fachkompetenz · Erfahrung · Culture Fit" />
          <AgentStep done={stepN >= 4} active={stepN === 3} label="Bewertung finalisieren" meta="Score · Stärken · Lücken · Begründung" />
        </div>
      )}

      {/* Stärken / Lücken */}
      {result && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#34d399", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>✓ Stärken</div>
            {result.staerken.map((s, i) => (
              <div key={i} style={{ fontSize: 12, color: "var(--fg-2)", padding: "4px 0", borderBottom: "1px solid var(--border)", lineHeight: 1.5 }}>{s}</div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#f87171", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>✗ Lücken</div>
            {result.luecken.map((l, i) => (
              <div key={i} style={{ fontSize: 12, color: "var(--fg-2)", padding: "4px 0", borderBottom: "1px solid var(--border)", lineHeight: 1.5 }}>{l}</div>
            ))}
          </div>
        </div>
      )}

      {/* Begründung */}
      {result?.reasoning && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>KI-Begründung</div>
          <div style={{ fontSize: 12, color: "var(--fg-2)", lineHeight: 1.75, padding: "12px 14px", borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            {result.reasoning}
          </div>
        </div>
      )}

      {/* Analyse button */}
      <button
        className="btn btn-primary"
        onClick={runAnalysis}
        disabled={running || ai.provider === "none"}
        style={{ alignSelf: "flex-start" }}
      >
        {running
          ? <><RefreshCircle width={13} height={13} style={{ animation: "spin 1s linear infinite" }} /> Analysiere…</>
          : result
            ? <><Refresh width={13} height={13} /> Neu analysieren</>
            : <><Sparks width={13} height={13} /> Analyse starten</>
        }
      </button>
    </>
  );
}

// ─── Contacts Tab ─────────────────────────────────────────────
const EMPTY_CONTACT_FORM = { name: "", role: "", email: "", phone: "", linkedinUrl: "", notes: "" };
type ContactForm = typeof EMPTY_CONTACT_FORM;

function ContactForm({
  form, onChange, onSave, onCancel, saveLabel
}: {
  form: ContactForm;
  onChange: (f: ContactForm) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  const set = (k: keyof ContactForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...form, [k]: e.target.value });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <datalist id="contact-role-opts">
        <option value="Recruiter" />
        <option value="Hiring Manager" />
        <option value="HR Business Partner" />
        <option value="Teamleiter" />
        <option value="CEO" />
        <option value="CTO" />
        <option value="Sonstiges" />
      </datalist>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="field" style={{ margin: 0 }}>
          <label>Name *</label>
          <input value={form.name} onChange={set("name")} placeholder="Max Muster" autoFocus />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Rolle</label>
          <input list="contact-role-opts" value={form.role} onChange={set("role")} placeholder="Recruiter, Teamleiter …" />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>E-Mail</label>
          <input value={form.email} onChange={set("email")} placeholder="kontakt@firma.de" type="email" />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Telefon</label>
          <input value={form.phone} onChange={set("phone")} placeholder="+41 79 …" />
        </div>
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>LinkedIn URL</label>
        <input value={form.linkedinUrl} onChange={set("linkedinUrl")} placeholder="https://linkedin.com/in/…" />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>Notizen</label>
        <textarea value={form.notes} onChange={set("notes")} placeholder="Gesprächsnotizen, Eindrücke …" rows={3} style={{ resize: "vertical" }} />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn btn-secondary" onClick={onCancel}>Abbrechen</button>
        <button className="btn btn-primary" onClick={onSave} disabled={!form.name.trim()}>{saveLabel}</button>
      </div>
    </div>
  );
}

function ContactsTab({ app }: { app: Application }) {
  const { data: contacts = [], refetch } = useQuery<ApplicationContact[]>({
    queryKey: ["contacts", app.id],
    queryFn: () => api.get(`/api/applications/${app.id}/contacts`).then((r) => r.data)
  });
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<ContactForm>(EMPTY_CONTACT_FORM);
  const [editForm, setEditForm] = useState<ContactForm>(EMPTY_CONTACT_FORM);

  const add = async () => {
    if (!addForm.name.trim()) return;
    await api.post(`/api/applications/${app.id}/contacts`, { ...addForm, name: addForm.name.trim() });
    setAddForm(EMPTY_CONTACT_FORM);
    setAdding(false);
    refetch();
  };

  const startEdit = (c: ApplicationContact) => {
    setEditId(c.id);
    setEditForm({ name: c.name, role: c.role ?? "", email: c.email ?? "", phone: c.phone ?? "", linkedinUrl: c.linkedinUrl ?? "", notes: c.notes ?? "" });
  };

  const saveEdit = async () => {
    if (!editForm.name.trim() || !editId) return;
    await api.patch(`/api/applications/${app.id}/contacts/${editId}`, { ...editForm, name: editForm.name.trim() });
    setEditId(null);
    refetch();
  };

  const del = async (cId: string) => {
    await api.delete(`/api/applications/${app.id}/contacts/${cId}`);
    refetch();
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn btn-primary" style={{ fontSize: 11, gap: 4, padding: "5px 10px" }}
          onClick={() => { setAdding((v) => !v); setEditId(null); }}>
          <Plus width={11} height={11} /> Kontakt
        </button>
      </div>

      {adding && (
        <div style={{ padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", marginBottom: 14 }}>
          <ContactForm form={addForm} onChange={setAddForm} onSave={add} onCancel={() => setAdding(false)} saveLabel="Hinzufügen" />
        </div>
      )}

      {contacts.length === 0 && !adding && (
        <div style={{ color: "var(--fg-3)", fontSize: 12, textAlign: "center", padding: "40px 0", border: "1px dashed var(--border)", borderRadius: 8 }}>
          Noch keine Kontakte
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {contacts.map((c) => (
          <div key={c.id} style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${editId === c.id ? "var(--accent-40)" : "var(--border)"}`, background: "var(--surface)" }}>
            {editId === c.id ? (
              <ContactForm form={editForm} onChange={setEditForm} onSave={saveEdit} onCancel={() => setEditId(null)} saveLabel="Speichern" />
            ) : (
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--fg-1)" }}>{c.name}</div>
                  {c.role && <div style={{ fontSize: 13, color: "var(--fg-3)", marginTop: 1 }}>{c.role}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                    {c.email && <a href={`mailto:${c.email}`} style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--accent)", fontSize: 13, textDecoration: "none" }}><Mail width={12} height={12} />{c.email}</a>}
                    {c.phone && <a href={`tel:${c.phone}`} style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--accent)", fontSize: 13, textDecoration: "none" }}><Phone width={12} height={12} />{c.phone}</a>}
                    {c.linkedinUrl && <a href={c.linkedinUrl} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 3, color: "#0a66c2", fontSize: 13, textDecoration: "none" }}><OpenNewWindow width={12} height={12} />LinkedIn</a>}
                  </div>
                  {c.notes && <div style={{ marginTop: 6, fontSize: 13, color: "var(--fg-2)", whiteSpace: "pre-wrap" }}>{c.notes}</div>}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="btn btn-ghost btn-icon" style={{ padding: 4 }} title="Bearbeiten" onClick={() => startEdit(c)}><EditPencil width={11} height={11} /></button>
                  <button className="btn btn-ghost btn-icon" style={{ padding: 4 }} title="Löschen" onClick={() => del(c.id)}><Trash width={12} height={12} /></button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Notes Tab ────────────────────────────────────────────────
function NotesTab({ app, onSave }: { app: Application; onSave: (patch: Partial<Application>) => void }) {
  const [notes, setNotes] = useState(app.notes ?? "");
  const [saved, setSaved] = useState(false);
  const save = () => { onSave({ notes }); setSaved(true); setTimeout(() => setSaved(false), 1500); };
  return (
    <>
      <div className="field">
        <AutoTextarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={save} placeholder="Notizen, Eindrücke, nächste Schritte…" minRows={8} />
      </div>
      <div className="autosave-indicator">
        <span className="dot" style={{ background: saved ? "var(--accent)" : "var(--green)" }} />
        {saved ? "Gespeichert." : "Wird beim Verlassen gespeichert."}
      </div>
    </>
  );
}

// ─── Confirmation Modal (generic) ────────────────────────────
function ConfirmModal({ title, description, confirmLabel, confirmColor = "var(--accent)", onConfirm, onClose, icon }: {
  title: string; description: string; confirmLabel: string;
  confirmColor?: string; icon: React.ReactNode;
  onConfirm: () => void; onClose: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 14, padding: 28, width: 380, display: "flex", flexDirection: "column", gap: 16 }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "var(--fg-1)", display: "flex", alignItems: "center", gap: 8 }}>
          {icon} {title}
        </div>
        <div style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.6 }}>{description}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onClose}><Xmark width={12} height={12} /> Abbrechen</button>
          <button style={{
            display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8,
            border: "none", background: confirmColor, color: "#fff",
            fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)"
          }} onClick={onConfirm}>
            {icon} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Archive Reason Modal ─────────────────────────────────────
const ARCHIVE_REASONS = [
  { id: "unavailable", label: "Stelle nicht mehr verfügbar",   emoji: "🚫" },
  { id: "irrelevant",  label: "Nicht relevant für mich",       emoji: "👎" },
  { id: "taken",       label: "Stelle bereits vergeben",       emoji: "🔒" },
  { id: "other",       label: "Sonstiger Grund",               emoji: "📝" },
] as const;

function ArchiveReasonModal({
  role, company, onConfirm, onClose
}: { role: string; company: string; onConfirm: (reason: string) => void; onClose: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");

  const confirm = () => {
    if (!selected) return;
    onConfirm(selected === "other" && customText.trim() ? customText.trim() : selected);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 14, padding: 28, width: 400, display: "flex", flexDirection: "column", gap: 16 }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "var(--fg-1)", display: "flex", alignItems: "center", gap: 8 }}>
          <Archive width={15} height={15} /> Bewerbung archivieren
        </div>
        <div style={{ fontSize: 13, color: "var(--fg-3)" }}>
          <strong style={{ color: "var(--fg-1)" }}>„{role}"</strong> bei {company} — warum wird diese Stelle archiviert?
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ARCHIVE_REASONS.map((r) => (
            <button key={r.id} onClick={() => setSelected(r.id)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "10px 14px", borderRadius: 10, border: `1px solid ${selected === r.id ? "var(--accent)" : "var(--border)"}`,
              background: selected === r.id ? "var(--accent-08)" : "var(--surface-2)",
              cursor: "pointer", fontFamily: "var(--font-sans)", textAlign: "left", transition: "all 0.12s"
            }}>
              <span style={{ fontSize: 16 }}>{r.emoji}</span>
              <span style={{ fontSize: 13, fontWeight: selected === r.id ? 600 : 400, color: selected === r.id ? "var(--accent)" : "var(--fg-1)" }}>{r.label}</span>
              {selected === r.id && <Check width={13} height={13} style={{ marginLeft: "auto", color: "var(--accent)" }} />}
            </button>
          ))}
          {selected === "other" && (
            <div className="field" style={{ margin: "4px 0 0" }}>
              <input
                autoFocus
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Kurze Begründung…"
                onKeyDown={(e) => e.key === "Enter" && confirm()}
              />
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onClose}><Xmark width={12} height={12} /> Abbrechen</button>
          <button
            disabled={!selected}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8,
              border: "none", background: selected ? "#6b7280" : "var(--border)", color: selected ? "#fff" : "var(--fg-3)",
              fontSize: 12, fontWeight: 600, cursor: selected ? "pointer" : "not-allowed", fontFamily: "var(--font-sans)", transition: "all 0.12s"
            }}
            onClick={confirm}
          >
            <Archive width={12} height={12} /> Archivieren
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── More Menu ────────────────────────────────────────────────
function MoreMenu({ onArchive, onDelete }: { onArchive: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const menuItem = (label: string, icon: React.ReactNode, onClick: () => void, danger = false) => (
    <button onClick={() => { setOpen(false); onClick(); }} style={{
      display: "flex", alignItems: "center", gap: 8, width: "100%",
      padding: "7px 12px", borderRadius: 7, border: "none",
      background: "transparent", color: danger ? "var(--red, #f43f5e)" : "var(--fg-1)",
      fontSize: 13, fontWeight: 500, cursor: "pointer",
      fontFamily: "var(--font-sans)", textAlign: "left",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.background = danger ? "rgba(244,63,94,0.08)" : "var(--surface-2)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
      {icon} {label}
    </button>
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn btn-ghost btn-icon" onClick={() => setOpen((v) => !v)}>
        <MoreHoriz width={14} height={14} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60,
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: 10, padding: 4, minWidth: 200,
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)"
        }}>
          {menuItem("Archivieren", <Archive width={13} height={13} style={{ color: "var(--fg-3)" }} />, onArchive)}
          <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
          {menuItem("Entfernen", <Trash width={13} height={13} />, onDelete, true)}
        </div>
      )}
    </div>
  );
}

// ─── Main DetailDrawer ────────────────────────────────────────
type Props = { app: Application; onClose: () => void };

export function DetailDrawer({ app, onClose }: Props) {
  const [tab, setTab]             = useState<Tab>("process");
  const [stage, setStage]         = useState<Application["stage"]>(app.stage);
  const [url, setUrl]             = useState(app.url ?? "");
  const [showDeleteModal, setShowDeleteModal]   = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const queryClient = useQueryClient();

  // Shared AI results registry — survives tab switches; initialized from DB-persisted fields
  const [aiResultsRegistry, setAiResultsRegistry] = useState<Record<string, { data: unknown; createdAt: Date }>>(() => {
    const init: Record<string, { data: unknown; createdAt: Date }> = {};
    if (app.glassdoorData) {
      try {
        const d = JSON.parse(app.glassdoorData as string);
        init["glassdoor-check"] = { data: d, createdAt: d.updatedAt ? new Date(d.updatedAt) : new Date() };
      } catch {}
    }
    if ((app as Application & { kununuData?: string }).kununuData) {
      try { const d = JSON.parse((app as Application & { kununuData?: string }).kununuData!); init["kununu-check"] = { data: d, createdAt: d.updatedAt ? new Date(d.updatedAt) : new Date() }; } catch {}
    }
    if ((app as Application & { linkedinData?: string }).linkedinData) {
      try { const d = JSON.parse((app as Application & { linkedinData?: string }).linkedinData!); init["linkedin-profile"] = { data: d, createdAt: d.updatedAt ? new Date(d.updatedAt) : new Date() }; } catch {}
    }
    const prep = app.stage === "interview_1" ? app.interview1Prep : app.stage === "interview_2" ? app.interview2Prep : null;
    if (prep) { try { init["interview-prep"] = { data: JSON.parse(prep), createdAt: new Date() }; } catch {} }
    // Load all other AI results from cache
    const cache = (app as Application & { aiResultsCache?: string }).aiResultsCache;
    if (cache) {
      try {
        const parsed = JSON.parse(cache) as Record<string, Record<string, unknown> & { _savedAt?: string }>;
        for (const [key, entry] of Object.entries(parsed)) {
          if (!init[key]) { // don't overwrite individually-stored entries
            init[key] = { data: entry, createdAt: entry._savedAt ? new Date(entry._savedAt) : new Date() };
          }
        }
      } catch {}
    }
    return init;
  });
  const registerAiResult = useCallback((id: string, data: unknown) => {
    setAiResultsRegistry(prev => ({ ...prev, [id]: { data, createdAt: new Date() } }));
  }, []);
  const updateAiResult = useCallback((id: string, data: unknown) => {
    setAiResultsRegistry(prev => ({ ...prev, [id]: { data, createdAt: new Date() } }));
  }, []);

  const patchMutation = useMutation({
    mutationFn: (patch: Partial<Application>) =>
      api.patch(`/api/applications/${app.id}`, patch).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications"] })
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/applications/${app.id}`).then((r) => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["applications"] }); onClose(); }
  });

  const handleStageChange = (s: string) => {
    setStage(s as Application["stage"]);
    patchMutation.mutate({ stage: s as Application["stage"] });
  };

  const handleArchive = (reason?: string) => {
    patchMutation.mutate({ archived: "true", archiveReason: reason } as Partial<Application>);
    queryClient.invalidateQueries({ queryKey: ["applications"] });
    onClose();
  };

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer" style={{ width: 760 }}>
        {/* Header */}
        <div className="drawer-head" style={{ flexDirection: "column", alignItems: "stretch", gap: 14, paddingBottom: 0, borderBottom: "none" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <LogoAvatar company={app.company} logoUrl={app.logoUrl} size={44} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="eyebrow" style={{ marginBottom: 2 }}>{app.company}</div>
              <h2 style={{ margin: "0 0 6px", fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--fg-1)" }}>
                {app.role}
              </h2>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {app.priority && app.priority !== "low" && (
                  <span className={`chip chip-priority-${app.priority}`}>{app.priority.charAt(0).toUpperCase() + app.priority.slice(1)}</span>
                )}
                {app.location && <span className="tag">{app.location}</span>}
                {app.salary && <span className="tag mono">{app.salary}</span>}
                {app.archiveReason && (
                  <span className="tag" style={{ color: "#f87171", borderColor: "rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)" }}>
                    <Archive width={10} height={10} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />
                    {ARCHIVE_REASON_LABELS[app.archiveReason] ?? app.archiveReason}
                  </span>
                )}
                {app.matchScore != null && (
                  <span
                    onClick={() => setTab("insights")}
                    title="Insights öffnen"
                    style={{
                      padding: "1px 7px", borderRadius: 999, fontSize: 11, fontWeight: 300, whiteSpace: "nowrap", cursor: "pointer",
                      background: app.matchScore >= 75 ? "rgba(52,211,153,0.15)" : app.matchScore >= 50 ? "rgba(251,191,36,0.15)" : "rgba(248,113,113,0.15)",
                      color: app.matchScore >= 75 ? "#34d399" : app.matchScore >= 50 ? "#fbbf24" : "#f87171",
                      border: `1px solid ${app.matchScore >= 75 ? "#34d39944" : app.matchScore >= 50 ? "#fbbf2444" : "#f8717144"}`
                    }}
                  >
                    {app.matchScore}%
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
              <StagePicker value={stage} onChange={handleStageChange} />
              {url && <a href={url} target="_blank" rel="noreferrer" className="btn btn-secondary"><OpenNewWindow width={13} height={13} /> Job</a>}
              <MoreMenu onArchive={() => setShowArchiveModal(true)} onDelete={() => setShowDeleteModal(true)} />
              <button className="btn btn-ghost btn-icon" onClick={onClose}><Xmark width={16} height={16} /></button>
            </div>
          </div>

          {/* Stage Progress — above tabs */}
          <div style={{ paddingBottom: 4 }}>
            <StageProgressBar stage={stage} />
          </div>

          {/* Tabs — scrollable */}
          <div className="hide-scrollbar" style={{ display: "flex", borderBottom: "1px solid var(--border)", overflowX: "auto", gap: 0 }}>
            {TABS.map(({ id, label }) => (
              <button key={id} className={"tab" + (tab === id ? " active" : "")} onClick={() => setTab(id)} style={{ whiteSpace: "nowrap" }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="drawer-body" style={{ paddingTop: 16 }}>
          {tab === "process"      && <ProcessTab      app={app} onSave={(p) => patchMutation.mutate(p)} onAiResult={registerAiResult} />}
          {tab === "details"      && <DetailsTab      app={app} stage={stage} url={url} onUrlChange={setUrl} onSave={(p) => patchMutation.mutate(p)} aiResults={aiResultsRegistry} onAiResultUpdate={updateAiResult} />}
          {tab === "documents"    && <DocumentsTab    app={app} />}
          {tab === "insights"     && <AgentTab        app={app} />}
          {tab === "contacts"     && <ContactsTab     app={app} />}
          {tab === "notes"        && <NotesTab        app={app} onSave={(p) => patchMutation.mutate(p)} />}
        </div>
      </aside>

      {showArchiveModal && (
        <ArchiveReasonModal
          role={app.role}
          company={app.company}
          onConfirm={(reason) => { setShowArchiveModal(false); handleArchive(reason); }}
          onClose={() => setShowArchiveModal(false)}
        />
      )}

      {showDeleteModal && (
        <ConfirmModal
          title="Bewerbung löschen"
          description={`„${app.role}" bei ${app.company} wird endgültig gelöscht — alle Angaben, Dokumente, Aktivitäten und Kontakte werden entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`}
          confirmLabel="Endgültig löschen"
          confirmColor="#f43f5e"
          icon={<Trash width={14} height={14} />}
          onConfirm={() => { setShowDeleteModal(false); deleteMutation.mutate(); }}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </>
  );
}

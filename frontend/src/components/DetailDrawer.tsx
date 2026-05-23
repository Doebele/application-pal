import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import cloud from "d3-cloud";
import {
  Xmark, OpenNewWindow, MoreHoriz, Check, Sparks, Refresh,
  NavArrowRight, Link, Plus, Mail, Phone, Calendar, Page,
  RefreshCircle, Trash, EditPencil, ChatBubbleEmpty, Clock, NavArrowDown, Archive, Copy,
  BrainElectricity, PageEdit, SendMail, Coins,
  Calendar as IcCalendar, CalendarArrowDown,
  Copy as IcCopy, MailOut, Brain,
  MapPin, VideoCamera, Expand, Collapse,
  Search, Spark, Building, CheckCircle, Linkedin, ChatBubbleCheck, Star,
  FolderPlus,
} from "iconoir-react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  Application, ApplicationDocument, ApplicationActivity, ApplicationContact, UserDocument
} from "@application-pal/shared";
import { api } from "../lib/api";
import { useUiStore, type AiConfig } from "../lib/store";
import { useTranslation } from "react-i18next";
import { ContractField, PensumField } from "./ImportDrawer";

// ─── Round flag icon (round-flag-icons library) ───────────────
// @ts-ignore
import deFlagUrl from "round-flag-icons/flags/de.svg?url";
// @ts-ignore
import gbFlagUrl from "round-flag-icons/flags/gb.svg?url";
function FlagIcon({ lang, size = 18 }: { lang: "de" | "en"; size?: number }) {
  return (
    <img
      src={lang === "de" ? deFlagUrl as string : gbFlagUrl as string}
      width={size} height={size}
      alt={lang === "de" ? "Deutsch" : "English"}
      style={{ borderRadius: "50%", display: "block", flexShrink: 0, objectFit: "cover" }}
    />
  );
}

type Tab = "process" | "details" | "documents" | "ki";

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
  { id: "process",   label: "Aktionen"   },
  { id: "details",   label: "Details"    },
  { id: "documents", label: "Dokumente"  },
  { id: "ki",        label: "KI-Inhalte" },
];

import { STAGE_COLORS, STAGE_LABELS_DE as STAGE_LABELS, STAGE_ORDER } from "../lib/stages";

const STAGES = STAGE_ORDER.map((id) => ({
  id,
  label: STAGE_LABELS[id] ?? id,
  short: STAGE_LABELS[id] ?? id,
}));

export const ARCHIVE_REASON_LABELS: Record<string, string> = {
  unavailable: "Stelle nicht mehr verfügbar",
  irrelevant:  "Nicht relevant",
  taken:       "Bereits vergeben",
  other:       "Sonstiger Grund",
};

const STAGE_TILES: Record<string, string[]> = {
  import_validating: ["glassdoor-check","kununu-check","linkedin-profile","salary-check","ats-keywords"],
  preparing_cv:      ["cv-highlights"],
  preparing_letter:  ["cover-letter","letter-review","opening-sentences"],
  application_sent:  ["company-research","salary-tips"],
  pending:           ["company-research","ackermann-script","salary-tips"],
  interview_1:       ["interview-prep","salary-tips"],
  interview_2:       ["interview-prep","salary-tips"],
  rejected:          [],
  accepted:          ["onboarding"],
};

const ALL_TILE_IDS = [
  "match-score",
  "glassdoor-check","kununu-check","linkedin-profile","salary-check","ats-keywords",
  "cv-highlights","cover-letter","letter-review","opening-sentences",
  "company-research","salary-tips","ackermann-script","interview-prep","onboarding",
];

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
  const [company, setCompany]       = useState(app.company);
  const [role, setRole]             = useState(app.role);
  const [location, setLocation]     = useState(app.location ?? "");
  const [salary, setSalary]         = useState(app.salary ?? "");
  const [jobType, setJobType]           = useState((app as Application & { jobType?: string }).jobType ?? "");
  const [workModel, setWorkModel]       = useState((app as Application & { workModel?: string }).workModel ?? "");
  const [contractType, setContractType] = useState((app as Application & { contractType?: string }).contractType ?? "");
  const [tags, setTags]             = useState<string[]>(parseTags(app.tags));
  const [newTag, setNewTag]         = useState("");
  const [saved, setSaved]           = useState(false);

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

  return (
    <>

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

      {/* Row 5: Pensum + Work Model + Contract */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div className="field">
          <label>Pensum</label>
          <PensumField
            value={jobType}
            onChange={v => { setJobType(v); save({ jobType: v || null } as Partial<Application>); }}
          />
        </div>
        <div className="field">
          <label>Arbeitsmodell</label>
          <select
            value={workModel}
            onChange={e => { setWorkModel(e.target.value); save({ workModel: e.target.value || null } as Partial<Application>); }}
            style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--fg-1)", fontSize: 12, fontFamily: "var(--font-sans)", outline: "none" }}
          >
            <option value="">—</option>
            <option value="onsite">Vor Ort</option>
            <option value="hybrid">Hybrid</option>
            <option value="remote">Remote</option>
          </select>
        </div>
        <div className="field">
          <label>Vertrag</label>
          <ContractField
            value={contractType}
            onChange={v => { setContractType(v); save({ contractType: v || null } as Partial<Application>); }}
          />
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
  "match-score":       "Match Score",
  "glassdoor-check":   "Glassdoor Rating",
  "kununu-check":      "Kununu Rating",
  "linkedin-profile":  "LinkedIn Firmenprofil",
  "salary-check":      "Gehalts-Check Schweiz",
  "ats-keywords":      "ATS-Keywords",
  "cv-highlights":     "CV-Highlights",
  "interview-prep":    "Interview-Vorbereitung",
  "salary-tips":       "Gehaltsverhandlung",
  "company-research":  "Unternehmensrecherche",
  "ackermann-script":  "Ackermann-Script",
  "cover-letter":      "Anschreiben",
  "letter-review":     "Anschreiben-Review",
  "opening-sentences": "Eröffnungssätze",
  "onboarding":        "Onboarding-Checkliste",
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
    case "cover-letter":
      return ((d.subject as string | undefined) ?? "").slice(0, 80);
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

function InterviewPrepDetail({ iv, appId, showToast }: { iv: InterviewPrep; appId: string; showToast?: (msg: string, type?: string) => void }) {
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  const copyAll = () => {
    const sep = "─".repeat(40);
    const text = [
      "ROLLENSPEZIFISCHE FRAGEN",
      sep,
      iv.rollenFragen.map((q, i) => `${i + 1}. ${q}`).join("\n"),
      `\nCHRIS VOSS FRAGEN`,
      sep,
      iv.vossFragenWhatHow.map(q => `→ ${q}`).join("\n"),
      `\nSTAR-BEISPIELE`,
      sep,
      iv.starBeispiele.map(s => `${s.frage}\nS: ${s.situation}\nT: ${s.aufgabe}\nA: ${s.aktion}\nR: ${s.ergebnis}`).join("\n\n"),
      `\nMEINE RÜCKFRAGEN`,
      sep,
      iv.rueckfragen.map(q => `? ${q}`).join("\n"),
    ].join("\n");
    copyText(text);
    showToast?.("Alles kopiert");
  };

  const exportDoc = async () => {
    setExporting(true);
    try {
      const r = await api.post<{ docUrl: string }>(`/api/applications/${appId}/ai/interview-prep/export-doc`, { interviewPrep: iv });
      setExportUrl(r.data.docUrl);
      showToast?.("Google Doc erstellt");
    } catch { showToast?.("Export fehlgeschlagen", "error"); }
    finally { setExporting(false); }
  };

  return (
    <div>
      {/* Action bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <button className="btn btn-secondary" style={{ fontSize: 11, gap: 5 }} onClick={copyAll}>
          <IcCopy width={11} height={11} /> Alles kopieren
        </button>
        {exportUrl ? (
          <a href={exportUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ fontSize: 11, gap: 5 }}>
            <Page width={11} height={11} /> Google Doc öffnen ↗
          </a>
        ) : (
          <button className="btn btn-secondary" style={{ fontSize: 11, gap: 5 }} onClick={exportDoc} disabled={exporting}>
            {exporting ? <RefreshCircle width={11} height={11} style={{ animation: "spin 1s linear infinite" }} /> : <Page width={11} height={11} />}
            Als Google Doc
          </button>
        )}
      </div>

      {/* Rollenspezifische Fragen */}
      <Accordion title="Rollenspezifische Fragen" count={iv.rollenFragen?.length ?? 0} color="#a78bfa"
        onCopy={() => copyText(iv.rollenFragen.map((q, i) => `${i + 1}. ${q}`).join("\n"))}>
        {iv.rollenFragen?.map((q, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "var(--fg-1)", padding: "5px 0", borderBottom: i < iv.rollenFragen.length - 1 ? "1px solid var(--border)" : "none" }}>
            <span style={{ color: "var(--fg-3)", flexShrink: 0 }}>{i + 1}.</span>
            <span style={{ flex: 1 }}>{q}</span>
            <button onClick={() => copyText(q)} title="Kopieren" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", padding: 0, flexShrink: 0, display: "flex", alignItems: "center", opacity: 0.6 }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}>
              <IcCopy width={10} height={10} />
            </button>
          </div>
        ))}
      </Accordion>

      {/* Chris Voss Fragen */}
      <Accordion title='Chris Voss "What / How"-Fragen' count={iv.vossFragenWhatHow?.length ?? 0} color="#34d399"
        onCopy={() => copyText(iv.vossFragenWhatHow.map(q => `→ ${q}`).join("\n"))}>
        <div style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 8, fontStyle: "italic" }}>Taktische offene Fragen nach "Never Split the Difference"</div>
        {iv.vossFragenWhatHow?.map((q, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "var(--fg-1)", padding: "5px 0", borderBottom: i < iv.vossFragenWhatHow.length - 1 ? "1px solid var(--border)" : "none" }}>
            <span style={{ color: "#34d399", flexShrink: 0 }}>→</span>
            <span style={{ flex: 1 }}>{q}</span>
            <button onClick={() => copyText(q)} title="Kopieren" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", padding: 0, flexShrink: 0, display: "flex", alignItems: "center", opacity: 0.6 }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}>
              <IcCopy width={10} height={10} />
            </button>
          </div>
        ))}
      </Accordion>

      {/* STAR-Beispiele */}
      <Accordion title="STAR-Beispiele" count={iv.starBeispiele?.length ?? 0} color="#fbbf24"
        onCopy={() => copyText(iv.starBeispiele.map(s => `${s.frage}\nS: ${s.situation}\nT: ${s.aufgabe}\nA: ${s.aktion}\nR: ${s.ergebnis}`).join("\n\n"))}>
        {iv.starBeispiele?.map((s, i) => (
          <div key={i} style={{ position: "relative", marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
            <button onClick={() => copyText(`${s.frage}\nS: ${s.situation}\nT: ${s.aufgabe}\nA: ${s.aktion}\nR: ${s.ergebnis}`)} title="Kopieren"
              style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", padding: 0, display: "flex", alignItems: "center", opacity: 0.6 }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}>
              <IcCopy width={11} height={11} />
            </button>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-1)", marginBottom: 6, paddingRight: 20 }}>❓ {s.frage}</div>
            {([["S", s.situation], ["T", s.aufgabe], ["A", s.aktion], ["R", s.ergebnis]] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ fontSize: 11, color: "var(--fg-2)", padding: "2px 0" }}>
                <span style={{ fontWeight: 700, color: "#fbbf24", marginRight: 6 }}>{k}:</span>{v}
              </div>
            ))}
          </div>
        ))}
      </Accordion>

      {/* Rückfragen */}
      <Accordion title="Meine Rückfragen" count={iv.rueckfragen?.length ?? 0} color="#60a5fa"
        onCopy={() => copyText(iv.rueckfragen.map(q => `? ${q}`).join("\n"))}>
        {iv.rueckfragen?.map((q, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "var(--fg-1)", padding: "5px 0", borderBottom: i < iv.rueckfragen.length - 1 ? "1px solid var(--border)" : "none" }}>
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
  );
}

function AckermannScriptDetail({ script, appId }: { script: AckermannScript; appId: string }) {
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  const copyAll = () => {
    const sep = "─".repeat(40);
    const lines = [
      `ZIELGEHALT: CHF ${script.zielgehalt?.toLocaleString("de-CH")}`,
      `ANKERGEBOT: CHF ${script.ankergebot?.toLocaleString("de-CH")} (~125% des Zielgehalts)`,
      `\n${sep}\nVERHANDLUNGSSCHRITTE\n${sep}`,
      ...(script.schritte ?? []).map(s =>
        `\nRunde ${s.runde} — CHF ${s.angebot?.toLocaleString("de-CH")}\n"${s.formulierung}"\nTaktik: ${s.taktik}`),
      `\n${sep}\nCHRIS VOSS ANKER-FORMULIERUNG\n${sep}\n${script.vossAnker}`,
      ...(script.nichtmonetaer?.length > 0
        ? [`\n${sep}\nNICHT-MONETÄRE ALTERNATIVEN\n${sep}`, ...script.nichtmonetaer.map(n => `• ${n}`)]
        : []),
    ];
    copyText(lines.join("\n"));
  };

  const exportDoc = async () => {
    setExporting(true);
    try {
      const r = await api.post<{ docUrl: string }>(`/api/applications/${appId}/ai/ackermann-script/export-doc`, { script });
      setExportUrl(r.data.docUrl);
    } catch { /* silent */ }
    finally { setExporting(false); }
  };

  return (
    <div>
      {/* Action bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <button className="btn btn-secondary" style={{ fontSize: 11, gap: 5 }} onClick={copyAll}>
          <IcCopy width={11} height={11} /> Alles kopieren
        </button>
        {exportUrl ? (
          <a href={exportUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ fontSize: 11, gap: 5 }}>
            <Page width={11} height={11} /> Google Doc öffnen ↗
          </a>
        ) : (
          <button className="btn btn-secondary" style={{ fontSize: 11, gap: 5 }} onClick={exportDoc} disabled={exporting}>
            {exporting ? <RefreshCircle width={11} height={11} style={{ animation: "spin 1s linear infinite" }} /> : <Page width={11} height={11} />}
            Als Google Doc
          </button>
        )}
      </div>

      {/* Ziel / Anker */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, padding: "10px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "var(--fg-3)", marginBottom: 3 }}>ZIELGEHALT</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--accent)" }}>{script.zielgehalt?.toLocaleString("de-CH")}</div>
        </div>
        <div style={{ flex: 1, padding: "10px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "var(--fg-3)", marginBottom: 3 }}>ANKERGEBOT (~125%)</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#34d399" }}>{script.ankergebot?.toLocaleString("de-CH")}</div>
        </div>
      </div>

      {/* Verhandlungsschritte */}
      {script.schritte?.map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--fg-3)", minWidth: 58, flexShrink: 0, paddingTop: 2 }}>RUNDE {s.runde}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: "var(--accent)" }}>CHF {s.angebot?.toLocaleString("de-CH")}</span>
              <button onClick={() => copyText(`${s.formulierung}`)} title="Formulierung kopieren"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", padding: 0, display: "flex", alignItems: "center", opacity: 0.6 }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}>
                <IcCopy width={10} height={10} />
              </button>
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-2)", fontStyle: "italic", lineHeight: 1.6, marginBottom: 4 }}>„{s.formulierung}"</div>
            <div style={{ fontSize: 10, color: "var(--fg-3)", lineHeight: 1.4 }}>🧠 {s.taktik}</div>
          </div>
        </div>
      ))}

      {/* Voss-Anker */}
      {script.vossAnker && (
        <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.25)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#34d399", textTransform: "uppercase", letterSpacing: "0.06em" }}>Chris Voss Anker-Formulierung</div>
            <button onClick={() => copyText(script.vossAnker)} title="Kopieren"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", padding: 0, display: "flex", alignItems: "center", opacity: 0.6 }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}>
              <IcCopy width={10} height={10} />
            </button>
          </div>
          <div style={{ fontSize: 12, color: "var(--fg-1)", lineHeight: 1.6 }}>{script.vossAnker}</div>
        </div>
      )}

      {/* Nicht-monetäre Alternativen */}
      {script.nichtmonetaer?.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <AiSection title="Nicht-monetäre Alternativen">
            <div>{script.nichtmonetaer.map((n, i) => <TagBadge key={i} text={n} />)}</div>
          </AiSection>
        </div>
      )}
    </div>
  );
}

function AiResultDetail({ id, data, appId, onUpdate }: {
  id: string; data: unknown; appId: string; onUpdate?: (id: string, data: unknown) => void;
}) {
  if (id === "match-score") {
    const r = data as MatchResult;
    const scoreColor = r.score >= 75 ? "#34d399" : r.score >= 50 ? "#fbbf24" : "#f87171";
    return (
      <>
        <div style={{ fontSize: 12, fontWeight: 700, color: scoreColor, marginBottom: 12 }}>
          {r.score >= 75 ? "Starke Übereinstimmung" : r.score >= 50 ? "Moderate Übereinstimmung" : "Schwache Übereinstimmung"}
        </div>
        <MiniBar label="Fachkompetenz"     value={r.breakdown.fachkompetenz}     color={scoreColor} />
        <MiniBar label="Erfahrung"          value={r.breakdown.erfahrung}          color={scoreColor} />
        <MiniBar label="Soft Skills"        value={r.breakdown.soft_skills}        color={scoreColor} />
        <MiniBar label="Kulturelle Passung" value={r.breakdown.kulturelle_passung} color={scoreColor} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#34d399", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>✓ Stärken</div>
            {r.staerken.map((s, i) => <div key={i} style={{ fontSize: 11, color: "var(--fg-2)", padding: "3px 0", borderBottom: "1px solid var(--border)", lineHeight: 1.5 }}>{s}</div>)}
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#f87171", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>✗ Lücken</div>
            {r.luecken.map((l, i) => <div key={i} style={{ fontSize: 11, color: "var(--fg-2)", padding: "3px 0", borderBottom: "1px solid var(--border)", lineHeight: 1.5 }}>{l}</div>)}
          </div>
        </div>
        {r.reasoning && (
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>KI-Begründung</div>
            <div style={{ fontSize: 11, color: "var(--fg-2)", lineHeight: 1.75, padding: "10px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)" }}>{r.reasoning}</div>
          </div>
        )}
      </>
    );
  }
  if (id === "cover-letter") {
    const cl = data as { subject: string; body: string };
    return (
      <>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Betreff</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)", marginBottom: 16, padding: "8px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)" }}>{cl.subject}</div>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Anschreiben</div>
        <div style={{ fontSize: 12, color: "var(--fg-1)", lineHeight: 1.75, whiteSpace: "pre-wrap", padding: "10px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)" }}>{cl.body}</div>
      </>
    );
  }
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
    return <InterviewPrepDetail iv={iv} appId={appId} />;
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
    return <AckermannScriptDetail script={as_} appId={appId} />;
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
  "match-score",
  "salary-check", "company-research",
  "salary-tips", "cover-letter", "letter-review", "opening-sentences",
]);

// IDs die drei Spalten breit sind
const TRIPLE_WIDTH_IDS = new Set(["ats-keywords"]);

// IDs die zusätzlich die doppelte Kachelhöhe benötigen
const DOUBLE_HEIGHT_IDS = new Set(["ats-keywords"]);

// ─── Word Cloud (d3-cloud) ───────────────────────────────────────────────────
interface WcWord { text: string; weight: number; color: string; }
interface WcLayout { text?: string; x?: number; y?: number; rotate?: number; size?: number; color?: string; }

/**
 * Build word list from a category with exponential weight decay by position.
 * baseWeight controls the category's prominence vs. other categories.
 * Each subsequent word within the category gets ~20% less weight.
 */
function wcWords(items: string[], baseWeight: number, color: string, maxItems = 6): WcWord[] {
  return items.slice(0, maxItems).map((text, i) => ({
    text,
    weight: baseWeight * Math.pow(0.80, i),
    color,
  }));
}

function WordCloudViz({ words, width, height }: { words: WcWord[]; width: number; height: number }) {
  const [placed, setPlaced] = useState<WcLayout[]>([]);

  const stable = useMemo(
    () => words,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [words.map(w => w.text + w.weight).join()]
  );

  useEffect(() => {
    if (!stable.length) return;
    const max = Math.max(...stable.map(w => w.weight));
    // font range: 8px (lightest) → 22px (heaviest) — kept compact so more words fit
    const layout = cloud<WcWord & { size: number; color: string }>()
      .size([width, height])
      .words(stable.map(w => ({
        ...w,
        size: 8 + Math.round((w.weight / max) * 14),
        color: w.color,
      })))
      .padding(2)
      // d3-cloud uses canvas for measurement — tell it to use condensed font
      .font("'Arial Narrow', 'Helvetica Neue', Arial, sans-serif")
      // ~20% chance of 90° rotation
      .rotate(() => (Math.random() < 0.2 ? (Math.random() > 0.5 ? 90 : -90) : 0))
      .fontSize(d => d.size ?? 10)
      .on("end", (out) => setPlaced(out as WcLayout[]))
      .start();
    return () => { layout.stop(); };
  }, [stable, width, height]);

  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <g transform={`translate(${width / 2},${height / 2})`}>
        {placed.map((w, i) => (
          <text key={i}
            textAnchor="middle"
            transform={`translate(${w.x ?? 0},${w.y ?? 0}) rotate(${w.rotate ?? 0})`}
            style={{
              fontSize: w.size,
              // Map size range 8–22 → font-weight 200–800 (snapped to nearest 100)
              fontWeight: Math.round((200 + (((w.size ?? 10) - 8) / 14) * 600) / 100) * 100,
              fill: w.color ?? "var(--fg-2)",
              fontFamily: "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif",
              fontStretch: "condensed",
              letterSpacing: "-0.01em",
              cursor: "default",
            }}
          >
            <title>{w.text}</title>
            {w.text}
          </text>
        ))}
      </g>
    </svg>
  );
}

function renderTileContent(id: string, data: unknown): React.ReactNode {
  const d = data as Record<string, unknown>;

  if (id === "match-score") {
    const score = d.score as number | undefined;
    if (score == null) return null;
    const color = score >= 75 ? "#34d399" : score >= 50 ? "#fbbf24" : "#f87171";
    const r = 28; const circ = 2 * Math.PI * r; const progress = (score / 100) * circ;
    return (
      <div style={{ position: "relative", width: 72, height: 72 }}>
        <svg width="72" height="72" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
          <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${progress} ${circ}`} strokeLinecap="round"
            transform="rotate(-90 36 36)" style={{ transition: "stroke-dasharray 0.6s ease" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: 9, color: "var(--fg-3)", fontWeight: 600 }}>%</span>
        </div>
      </div>
    );
  }

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
    const kw = d as AtsKeywords;
    // 3 per category max in the compact tile — condensed font fits them comfortably
    const words: WcWord[] = [
      ...wcWords(kw.mustHave   ?? [], 10,  "#60a5fa", 3),
      ...wcWords(kw.niceToHave ?? [], 6.5, "#a78bfa", 3),
      ...wcWords(kw.softSkills ?? [], 4.5, "#34d399", 3),
      ...wcWords(kw.tools      ?? [], 4.0, "#fbbf24", 3),
    ];
    if (!words.length) return null;
    return <WordCloudViz words={words} width={280} height={190} />;
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
  if (id === "cover-letter") {
    const subj = (d.subject as string | undefined) ?? "";
    const body = (d.body as string | undefined) ?? "";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3, width: "100%" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--fg-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subj}</span>
        <span style={{ fontSize: 10, color: "var(--fg-3)", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{body}</span>
      </div>
    );
  }
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

// Phase color per tile — filled tiles get this color as background tint
const TILE_PHASE_COLORS: Record<string, string> = {
  "match-score":       "#60a5fa",  // blue  (universal)
  "glassdoor-check":   "#94a3b8",  // slate (Inbox)
  "kununu-check":      "#94a3b8",
  "linkedin-profile":  "#94a3b8",
  "salary-check":      "#94a3b8",
  "ats-keywords":      "#94a3b8",
  "cv-highlights":     "#60a5fa",  // blue  (CV)
  "cover-letter":      "#22d3ee",  // cyan  (Letter)
  "letter-review":     "#22d3ee",
  "opening-sentences": "#22d3ee",
  "company-research":  "#a78bfa",  // purple (Sent/Pending)
  "salary-tips":       "#a78bfa",
  "ackermann-script":  "#fbbf24",  // amber (Pending)
  "interview-prep":    "#34d399",  // green (Interview)
  "onboarding":        "#84cc16",  // lime  (Accepted)
};

const TILE_EMPTY_LABELS: Record<string, string> = {
  "match-score":       "Analyse starten",
  "glassdoor-check":   "Bewertung ermitteln",
  "kununu-check":      "Bewertung ermitteln",
  "linkedin-profile":  "Profil ermitteln",
  "salary-check":      "Lohnband berechnen",
  "ats-keywords":      "Keywords extrahieren",
  "cv-highlights":     "CV analysieren",
  "interview-prep":    "Vorbereitung generieren",
  "company-research":  "Recherche starten",
  "ackermann-script":  "Script generieren",
  "cover-letter":      "Anschreiben erstellen",
  "letter-review":     "Review starten",
  "opening-sentences": "Sätze generieren",
  "onboarding":        "Checkliste erstellen",
  "salary-tips":       "Tipps generieren",
};

function AiResultTile({ id, entry, onExpand, onRun }: {
  id: string;
  entry: { data: unknown; createdAt: Date } | null;
  onExpand: () => void;
  onRun?: () => Promise<void>;
}) {
  const label      = AI_RESULT_LABELS[id] ?? id;
  const isDouble   = DOUBLE_WIDTH_IDS.has(id);
  const isTriple   = TRIPLE_WIDTH_IDS.has(id);
  const isDoubleH  = DOUBLE_HEIGHT_IDS.has(id);
  const content    = entry ? renderTileContent(id, entry.data) : null;
  const hasData    = !!content;
  const phaseColor = TILE_PHASE_COLORS[id];

  const [running, setRunning] = useState(false);
  const [tileToast, setTileToast] = useState<{ msg: string; ok: boolean; leaving: boolean } | null>(null);
  const tileToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fireTileToast = (msg: string, ok = true) => {
    if (tileToastTimer.current) clearTimeout(tileToastTimer.current);
    setTileToast({ msg, ok, leaving: false });
    tileToastTimer.current = setTimeout(() => {
      setTileToast(t => t ? { ...t, leaving: true } : null);
      setTimeout(() => setTileToast(null), 200);
    }, 2600);
  };

  const handleRun = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (running || !onRun) return;
    setRunning(true);
    fireTileToast("Generierung wird durchgeführt…");
    try {
      await onRun();
    } catch {
      fireTileToast("Generierung fehlgeschlagen", false);
    } finally {
      setRunning(false);
    }
  };

  const tileStyle: React.CSSProperties = hasData && phaseColor ? {
    background: `${phaseColor}18`, border: `1px solid ${phaseColor}50`,
  } : { background: "var(--surface)", border: "1px solid var(--border)" };

  const labelColor  = hasData && phaseColor ? `${phaseColor}cc` : "var(--fg-4)";
  const expandColor = hasData && phaseColor ? phaseColor : "var(--accent)";

  // Empty tile: main click = run (if onRun provided); expand icon = expand
  // Filled tile: main click = expand
  const handleTileClick = (!hasData && onRun) ? handleRun : onExpand;

  return (
    <button
      onClick={handleTileClick}
      style={{
        gridColumn: isTriple ? "span 3" : isDouble ? "span 2" : undefined,
        gridRow:    isDoubleH ? "span 2" : undefined,
        position: "relative",
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "12px 12px 14px", borderRadius: 12, minHeight: isDoubleH ? 240 : 120,
        cursor: "pointer", fontFamily: "var(--font-sans)",
        transition: "background 0.2s, border-color 0.2s",
        ...tileStyle,
      }}
    >
      {/* Label */}
      <span style={{ fontSize: 11, color: labelColor, marginBottom: 10, lineHeight: 1, textAlign: "center", fontWeight: hasData ? 600 : 400 }}>
        {label}
      </span>

      {/* Expand icon — always opens expand, stops propagation */}
      <div
        role="button"
        aria-label="Vollbild"
        onClick={e => { e.stopPropagation(); onExpand(); }}
        style={{ position: "absolute", top: 8, right: 8, color: expandColor, display: "flex", padding: 2, borderRadius: 4, cursor: "pointer" }}
      >
        <Expand width={13} height={13} />
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", width: "100%", minHeight: 64 }}>
        {hasData ? (
          <div style={{ display: "flex", alignItems: (isDouble || isTriple) ? "flex-start" : "center", justifyContent: "center", width: "100%" }}>
            {content}
          </div>
        ) : (
          // Empty state: shows a pill-button that triggers generation
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 11, fontWeight: 500, textAlign: "center", lineHeight: 1.4,
            color: running ? "var(--fg-4)" : onRun ? "var(--accent)" : "var(--fg-3)",
            padding: "5px 10px", borderRadius: 6,
            border: `1px solid ${running ? "var(--border)" : onRun ? "var(--accent-15)" : "var(--border)"}`,
            background: running ? "var(--surface-2)" : onRun ? "var(--accent-08)" : "transparent",
            transition: "all 0.15s",
          }}>
            {running && <RefreshCircle width={11} height={11} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />}
            {running ? "Wird generiert…" : (TILE_EMPTY_LABELS[id] ?? "Analyse starten")}
          </span>
        )}
      </div>

      {/* In-tile toast */}
      {tileToast && (
        <div
          className={tileToast.leaving ? "toast-leave" : "toast-enter"}
          style={{
            position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 10px", borderRadius: 8, zIndex: 5, whiteSpace: "nowrap",
            background: tileToast.ok ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
            border: `1px solid ${tileToast.ok ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`,
            fontSize: 10, fontWeight: 600,
            color: tileToast.ok ? "#34d399" : "#f87171",
          }}
        >
          <span>{tileToast.ok ? "✓" : "✕"}</span>
          {tileToast.msg}
        </div>
      )}
    </button>
  );
}

// ─── Build an onRun callback for a tile (reused by ProcessTab + KiInhalteTab) ─
function buildTileRunner(
  id: string,
  appId: string,
  ai: AiConfig,
  queryClient: ReturnType<typeof useQueryClient>,
  onRegister: (id: string, data: unknown) => void,
): (() => Promise<void>) | undefined {
  const endpoint = ACTION_ENDPOINTS[id];
  if (!endpoint) return undefined;
  return async () => {
    if (ai.provider === "none") throw new Error("Kein KI-Modell konfiguriert");
    const aiBody = { ai: { provider: ai.provider, anthropicApiKey: ai.anthropicApiKey, lmStudioUrl: ai.lmStudioUrl, lmStudioModel: ai.lmStudioModel } };
    const r = await api.post<Record<string, unknown>>(`/api/applications/${appId}${endpoint}`, aiBody);
    onRegister(id, r.data);
    queryClient.invalidateQueries({ queryKey: ["applications"] });
    queryClient.invalidateQueries({ queryKey: ["application", appId] });
  };
}

// ─── Large tile (2× scale) for expand right column ───────────
function renderTileContentLarge(id: string, data: unknown): React.ReactNode {
  const d = data as Record<string, unknown>;
  if (id === "match-score") {
    const score = d.score as number | undefined;
    if (score == null) return null;
    const color = score >= 75 ? "#34d399" : score >= 50 ? "#fbbf24" : "#f87171";
    const r = 54; const circ = 2 * Math.PI * r; const progress = (score / 100) * circ;
    return (
      <div style={{ position: "relative", width: 140, height: 140, margin: "0 auto" }}>
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth="9" />
          <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="9"
            strokeDasharray={`${progress} ${circ}`} strokeLinecap="round"
            transform="rotate(-90 70 70)" style={{ transition: "stroke-dasharray 0.6s ease" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 36, fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: 12, color: "var(--fg-3)", fontWeight: 600 }}>%</span>
        </div>
      </div>
    );
  }
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
    const kw = d as AtsKeywords;
    // Large tile (expand view right column): 4 per category
    const words: WcWord[] = [
      ...wcWords(kw.mustHave   ?? [], 10,  "#60a5fa", 4),
      ...wcWords(kw.niceToHave ?? [], 6.5, "#a78bfa", 4),
      ...wcWords(kw.softSkills ?? [], 4.5, "#34d399", 4),
      ...wcWords(kw.tools      ?? [], 4.0, "#fbbf24", 4),
    ];
    if (!words.length) return null;
    return <WordCloudViz words={words} width={185} height={210} />;
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

// Endpoint map for Google Doc export (subset of AI types)
const EXPORT_DOC_ENDPOINTS: Record<string, string> = {
  "cover-letter":      "/ai/cover-letter/export-doc",
  "company-research":  "/ai/company-research/export-doc",
  "ackermann-script":  "/ai/ackermann-script/export-doc",
  "salary-check":      "/ai/salary-check/export-doc",
  "salary-tips":       "/ai/salary-tips/export-doc",
  "onboarding":        "/ai/onboarding/export-doc",
  "interview-prep":    "/ai/interview-prep/export-doc",
  "cv-highlights":     "/ai/cv-highlights/export-doc",
  "letter-review":     "/ai/letter-review/export-doc",
  "opening-sentences": "/ai/opening-sentences/export-doc",
};

// Flatten entry data to plain text for clipboard
function tileTextContent(id: string, data: unknown): string {
  const d = data as Record<string, unknown>;
  const lines: string[] = [];
  const sep = "─".repeat(40);
  switch (id) {
    case "cover-letter": {
      if (d.subject) lines.push(String(d.subject));
      if (d.body) lines.push(String(d.body));
      break;
    }
    case "company-research": {
      const cr = d as CompanyResearch;
      if (cr.unternehmensueberblick) lines.push("ÜBERBLICK\n" + cr.unternehmensueberblick);
      if (cr.unternehmenskultur)    lines.push("KULTUR\n"    + cr.unternehmenskultur);
      if (cr.marktposition)          lines.push("MARKTPOSITION\n" + cr.marktposition);
      if (cr.wettbewerber?.length)   lines.push("WETTBEWERBER\n" + cr.wettbewerber.join(" · "));
      if (cr.aktuelleThemen?.length) lines.push("AKTUELLE THEMEN\n" + cr.aktuelleThemen.map(t => "• " + t).join("\n"));
      break;
    }
    case "salary-check": {
      const sc = d as SalaryCheck;
      const lb = sc.lohnband;
      if (lb) lines.push(`LOHNBAND (${sc.waehrung ?? "CHF"})\nMin: ${lb.min?.toLocaleString("de-CH")} · Median: ${lb.median?.toLocaleString("de-CH")} · Max: ${lb.max?.toLocaleString("de-CH")}`);
      if (sc.begruendung) lines.push("BEGRÜNDUNG\n" + sc.begruendung);
      if (sc.faktoren?.length) lines.push("EINFLUSSFAKTOREN\n" + sc.faktoren.join(" · "));
      break;
    }
    case "salary-tips": {
      const st = d as SalaryTips;
      if (st["markteinschätzung"]) lines.push("MARKTEINSCHÄTZUNG\n" + st["markteinschätzung"]);
      if (st.taktiken?.length)     lines.push("TAKTIKEN\n" + st.taktiken.map(t => "• " + t).join("\n"));
      if (st.formulierungen?.length) lines.push("FORMULIERUNGEN\n" + st.formulierungen.map(f => "• " + f).join("\n"));
      if (st.vossAnker)            lines.push("VOSS-ANKER\n" + st.vossAnker);
      break;
    }
    case "ats-keywords": {
      const kw = d as AtsKeywords;
      if (kw.mustHave?.length)   lines.push("MUST HAVE\n"   + kw.mustHave.join(", "));
      if (kw.niceToHave?.length) lines.push("NICE TO HAVE\n"+ kw.niceToHave.join(", "));
      if (kw.softSkills?.length) lines.push("SOFT SKILLS\n" + kw.softSkills.join(", "));
      if (kw.tools?.length)      lines.push("TOOLS\n"       + kw.tools.join(", "));
      break;
    }
    case "cv-highlights": {
      const cv = d as CvHighlights;
      if (cv.highlights?.length) lines.push("STÄRKEN\n" + cv.highlights.map(h => "• " + h).join("\n"));
      if (cv.keywords?.length)   lines.push("KEYWORDS\n"  + cv.keywords.join(", "));
      if (cv.gaps?.length)       lines.push("LÜCKEN\n"    + cv.gaps.map(g => "⚠ " + g).join("\n"));
      break;
    }
    case "cover-letter": {
      if (d.subject) lines.push("BETREFF\n" + String(d.subject));
      if (d.body) lines.push("ANSCHREIBEN\n" + String(d.body));
      break;
    }
    case "letter-review": {
      const lr = d as LetterReview;
      if (lr.gesamteindruck)         lines.push("GESAMTEINDRUCK\n" + lr.gesamteindruck);
      if (lr.staerken?.length)       lines.push("STÄRKEN\n"        + lr.staerken.map(s => "✓ " + s).join("\n"));
      if (lr.verbesserungen?.length) lines.push("VERBESSERUNGEN\n" + lr.verbesserungen.map(v => "→ " + v).join("\n"));
      if (lr.cliches?.length)        lines.push("CLICHÉS\n"        + lr.cliches.join(", "));
      break;
    }
    case "opening-sentences": {
      const os = d as OpeningSentences;
      if (os.saetze?.length) lines.push(os.saetze.map((s, i) => `${i+1}. ${s.satz}\n   [${s.ansatz}]`).join("\n\n"));
      break;
    }
    case "onboarding": {
      const oc = d as OnboardingChecklist;
      if (oc.erste30Tage?.length) lines.push("ERSTE 30 TAGE\n" + oc.erste30Tage.map(t => "• " + t).join("\n"));
      if (oc.erste60Tage?.length) lines.push("ERSTE 60 TAGE\n" + oc.erste60Tage.map(t => "• " + t).join("\n"));
      if (oc.erste90Tage?.length) lines.push("ERSTE 90 TAGE\n" + oc.erste90Tage.map(t => "• " + t).join("\n"));
      if (oc.allgemein?.length)   lines.push("ALLGEMEIN\n"      + oc.allgemein.map(t => "• " + t).join("\n"));
      break;
    }
    case "match-score": {
      const mr = d as MatchResult;
      lines.push(`MATCH SCORE: ${mr.score}%`);
      lines.push(`Fachkompetenz ${mr.breakdown.fachkompetenz}% · Erfahrung ${mr.breakdown.erfahrung}% · Soft Skills ${mr.breakdown.soft_skills}% · Kultur ${mr.breakdown.kulturelle_passung}%`);
      if (mr.staerken?.length) lines.push("STÄRKEN\n" + mr.staerken.map(s => "✓ " + s).join("\n"));
      if (mr.luecken?.length)  lines.push("LÜCKEN\n"  + mr.luecken.map(l => "✗ " + l).join("\n"));
      if (mr.reasoning)        lines.push("BEGRÜNDUNG\n" + mr.reasoning);
      break;
    }
    case "glassdoor-check": {
      const gd = d as GlassdoorData;
      lines.push(`GLASSDOOR: ${gd.rating != null ? `★ ${gd.rating}` : "—"} (${gd.reviewCount ?? "?"} Reviews)`);
      if (gd.pros)  lines.push("PRO\n"    + gd.pros);
      if (gd.cons)  lines.push("CONTRA\n" + gd.cons);
      if (gd.summary) lines.push(gd.summary);
      break;
    }
    case "kununu-check": {
      const kn = d as KununuData;
      lines.push(`KUNUNU: ${kn.rating != null ? `★ ${kn.rating}` : "—"} (${kn.reviewCount ?? "?"} Reviews)`);
      if (kn.url) lines.push(kn.url);
      break;
    }
    case "linkedin-profile": {
      const li = d as LinkedinData;
      if (li.url) lines.push(li.url);
      if (li.employeeCount) lines.push(`Mitarbeitende: ${li.employeeCount}`);
      if (li.description)   lines.push(li.description);
      break;
    }
    case "ackermann-script": {
      const as_ = d as AckermannScript;
      lines.push(`ZIELGEHALT: CHF ${as_.zielgehalt?.toLocaleString("de-CH")}`);
      lines.push(`ANKERGEBOT: CHF ${as_.ankergebot?.toLocaleString("de-CH")} (~125%)`);
      if (as_.schritte?.length) {
        lines.push(sep + "\nVERHANDLUNGSSCHRITTE");
        as_.schritte.forEach(s => lines.push(`Runde ${s.runde} — CHF ${s.angebot?.toLocaleString("de-CH")}\n"${s.formulierung}"\nTaktik: ${s.taktik}`));
      }
      if (as_.vossAnker) lines.push(sep + "\nVOSS-ANKER\n" + as_.vossAnker);
      if (as_.nichtmonetaer?.length) lines.push(sep + "\nNICHT-MONETÄR\n" + as_.nichtmonetaer.map(n => "• " + n).join("\n"));
      break;
    }
    case "interview-prep": {
      const iv = d as InterviewPrep;
      if (iv.rollenFragen?.length)   lines.push("ROLLENSPEZIFISCHE FRAGEN\n" + iv.rollenFragen.map((q,i) => `${i+1}. ${q}`).join("\n"));
      if (iv.vossFragenWhatHow?.length) lines.push("CHRIS VOSS FRAGEN\n" + iv.vossFragenWhatHow.map(q => `→ ${q}`).join("\n"));
      if (iv.starBeispiele?.length)  lines.push("STAR-BEISPIELE\n" + iv.starBeispiele.map(s => `${s.frage}\nS: ${s.situation}\nT: ${s.aufgabe}\nA: ${s.aktion}\nR: ${s.ergebnis}`).join("\n\n"));
      if (iv.rueckfragen?.length)    lines.push("RÜCKFRAGEN\n"     + iv.rueckfragen.map(q => `? ${q}`).join("\n"));
      break;
    }
  }
  return lines.join(`\n\n${sep}\n\n`);
}

// Endpoint map for direct execution from expand view
const ACTION_ENDPOINTS: Record<string, string> = {
  "match-score":       "/match-score",
  "glassdoor-check":   "/ai/glassdoor-check",
  "kununu-check":      "/ai/kununu-check",
  "linkedin-profile":  "/ai/linkedin-profile",
  "salary-check":      "/ai/salary-check",
  "ats-keywords":      "/ai/ats-keywords",
  "cv-highlights":     "/ai/cv-highlights",
  "cover-letter":      "/ai/cover-letter",
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
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ── Local toast ──
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err"; leaving: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fireToast = (msg: string, type: "ok" | "err" = "ok") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type, leaving: false });
    // start leave animation 200ms before removal
    toastTimer.current = setTimeout(() => {
      setToast(t => t ? { ...t, leaving: true } : null);
      setTimeout(() => setToast(null), 220);
    }, 2600);
  };

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
      // Invalidate so the parent re-fetches fresh aiResultsCache from DB
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["application", appId] });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Fehler";
      setErr(msg);
    } finally { setRunning(false); }
  };

  const hasData = !!entry;
  const ts = entry?.createdAt.toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

  // Build export body based on tile type
  const exportDoc = async () => {
    const endpoint = EXPORT_DOC_ENDPOINTS[id];
    if (!endpoint || !entry) return;
    setExporting(true);
    try {
      const body: Record<string, unknown> = {};
      if (id === "cover-letter")       { const cl = entry.data as { subject: string; body: string }; body.subject = cl.subject; body.body = cl.body; }
      else if (id === "interview-prep")    body.interviewPrep    = entry.data;
      else if (id === "ackermann-script") body.script       = entry.data;
      else if (id === "onboarding")   body.checklist        = entry.data;
      else if (id === "salary-check") body.salaryCheck      = entry.data;
      else if (id === "cv-highlights") body.highlights      = entry.data;
      else if (id === "company-research") body.research     = entry.data;
      else if (id === "salary-tips")  body.tips             = entry.data;
      else if (id === "letter-review") body.review          = entry.data;
      else if (id === "opening-sentences") body.sentences   = entry.data;
      const r = await api.post<{ docUrl: string }>(`/api/applications/${appId}${endpoint}`, body);
      setExportUrl(r.data.docUrl);
      fireToast("Google Doc erstellt ↗");
    } catch { fireToast("Export fehlgeschlagen", "err"); }
    finally { setExporting(false); }
  };

  return (
    <div style={{ ...expandStyle, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--fg-1)" }}>
          {AI_RESULT_LABELS[id] ?? id}
        </span>
        {ts && <span style={{ fontSize: 10, color: "var(--fg-4)" }}>{ts}</span>}
        <div style={{ flex: 1 }} />

        {/* ── Action buttons (only when data exists) ── */}
        {hasData && (
          <>
            {/* Copy to clipboard */}
            <button
              className="btn btn-secondary"
              style={{ fontSize: 11, gap: 5 }}
              onClick={() =>
                copyText(tileTextContent(id, entry.data))
                  .then(() => fireToast("Text kopiert"))
                  .catch(() => fireToast("Kopieren fehlgeschlagen", "err"))
              }
            >
              <IcCopy width={11} height={11} />
              Kopieren
            </button>

            {/* Google Doc export */}
            {EXPORT_DOC_ENDPOINTS[id] && (
              exportUrl ? (
                <a href={exportUrl} target="_blank" rel="noopener noreferrer"
                  className="btn btn-secondary" style={{ fontSize: 11, gap: 5 }}>
                  <Page width={11} height={11} />
                  Google Doc ↗
                </a>
              ) : (
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 11, gap: 5 }}
                  onClick={exportDoc}
                  disabled={exporting}
                >
                  {exporting
                    ? <RefreshCircle width={11} height={11} style={{ animation: "spin 1s linear infinite" }} />
                    : <Page width={11} height={11} />
                  }
                  Als Google Doc
                </button>
              )
            )}
          </>
        )}

        {/* Aktualisieren / Jetzt ausführen */}
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

      {/* ATS-Keywords: full-width cloud + 4-column category list */}
      {id === "ats-keywords" && hasData ? (() => {
        const kw = entry.data as AtsKeywords;
        const allWords: WcWord[] = [
          ...wcWords(kw.mustHave   ?? [], 10,  "#60a5fa", 999),
          ...wcWords(kw.niceToHave ?? [], 6.5, "#a78bfa", 999),
          ...wcWords(kw.softSkills ?? [], 4.5, "#34d399", 999),
          ...wcWords(kw.tools      ?? [], 4.0, "#fbbf24", 999),
        ];
        const categories = [
          { title: "Must Have",         items: kw.mustHave   ?? [], color: "#60a5fa" },
          { title: "Nice to Have",      items: kw.niceToHave ?? [], color: "#a78bfa" },
          { title: "Soft Skills",       items: kw.softSkills ?? [], color: "#34d399" },
          { title: "Tools & Technologien", items: kw.tools  ?? [], color: "#fbbf24" },
        ].filter(c => c.items.length > 0);
        return (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Full-width word cloud */}
            <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <WordCloudViz words={allWords} width={640} height={200} />
            </div>
            {/* 4-column category grid */}
            <div style={{ flex: 1, overflow: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${categories.length}, 1fr)`, gap: 12 }}>
                {categories.map(cat => (
                  <div key={cat.title}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: cat.color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>{cat.title}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {cat.items.map((kw, i) => (
                        <span key={i} style={{
                          padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500,
                          background: `${cat.color}14`, color: cat.color,
                          border: `1px solid ${cat.color}30`,
                        }}>{kw}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })() : (
      /* Default: two-column: left = detail content, right = large tile */
      <div style={{ display: "flex", gap: 20, flex: 1, minHeight: 0, alignItems: "flex-start" }}>
        {/* Left column — detail content */}
        <div style={{ flex: 1, overflow: "auto", alignSelf: "stretch" }}>
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
      )}

      {/* ── Toast notification — bottom-center of expand overlay ── */}
      {toast && (
        <div
          className={toast.leaving ? "toast-leave" : "toast-enter"}
          style={{
            position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
            display: "flex", alignItems: "center", gap: 8,
            padding: "9px 16px", borderRadius: 10, zIndex: 20,
            background: toast.type === "ok" ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
            border: `1px solid ${toast.type === "ok" ? "rgba(52,211,153,0.35)" : "rgba(248,113,113,0.35)"}`,
            backdropFilter: "blur(8px)",
            fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
            color: toast.type === "ok" ? "#34d399" : "#f87171",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          }}
        >
          <span>{toast.type === "ok" ? "✓" : "✕"}</span>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── Contact form helpers (shared by ContactsSection + ContactsTab) ──
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

// ─── Contacts Section (inline in DetailsTab) ──────────────────
function ContactsSection({ app }: { app: Application }) {
  const { data: contacts = [], refetch } = useQuery<ApplicationContact[]>({
    queryKey: ["contacts", app.id],
    queryFn: () => api.get(`/api/applications/${app.id}/contacts`).then((r) => r.data)
  });
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<ContactForm>(EMPTY_CONTACT_FORM);
  const [editForm, setEditForm] = useState<ContactForm>(EMPTY_CONTACT_FORM);

  const add = async () => {
    if (!addForm.name.trim()) return;
    await api.post(`/api/applications/${app.id}/contacts`, { ...addForm, name: addForm.name.trim() });
    setAddForm(EMPTY_CONTACT_FORM); setAdding(false); refetch();
  };
  const startEdit = (c: ApplicationContact) => {
    setEditId(c.id);
    setEditForm({ name: c.name, role: c.role ?? "", email: c.email ?? "", phone: c.phone ?? "", linkedinUrl: c.linkedinUrl ?? "", notes: c.notes ?? "" });
  };
  const saveEdit = async () => {
    if (!editForm.name.trim() || !editId) return;
    await api.patch(`/api/applications/${app.id}/contacts/${editId}`, { ...editForm, name: editForm.name.trim() });
    setEditId(null); refetch();
  };
  const del = async (cId: string) => {
    await api.delete(`/api/applications/${app.id}/contacts/${cId}`); refetch();
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: open ? 10 : 0, cursor: "pointer" }}
        onClick={() => setOpen(v => !v)}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Kontakte {contacts.length > 0 && `(${contacts.length})`}
        </div>
        <NavArrowDown width={11} height={11} style={{ color: "var(--fg-3)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </div>
      {open && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button className="btn btn-primary" style={{ fontSize: 11, gap: 4, padding: "5px 10px" }}
              onClick={(e) => { e.stopPropagation(); setAdding(v => !v); setEditId(null); }}>
              <Plus width={11} height={11} /> Kontakt
            </button>
          </div>
          {adding && (
            <div style={{ padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", marginBottom: 14 }}>
              <ContactForm form={addForm} onChange={setAddForm} onSave={add} onCancel={() => setAdding(false)} saveLabel="Hinzufügen" />
            </div>
          )}
          {contacts.length === 0 && !adding && (
            <div style={{ color: "var(--fg-3)", fontSize: 12, textAlign: "center", padding: "24px 0", border: "1px dashed var(--border)", borderRadius: 8 }}>
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
      )}
    </div>
  );
}

// ─── Notes Section (inline in DetailsTab) ─────────────────────
function NotesSection({ app, onSave }: { app: Application; onSave: (patch: Partial<Application>) => void }) {
  const [notes, setNotes] = useState(app.notes ?? "");
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const save = () => { onSave({ notes }); setSaved(true); setTimeout(() => setSaved(false), 1500); };
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: open ? 10 : 0, cursor: "pointer" }}
        onClick={() => setOpen(v => !v)}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Notizen</div>
        <NavArrowDown width={11} height={11} style={{ color: "var(--fg-3)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </div>
      {open && (
        <>
          <div className="field" style={{ marginTop: 8 }}>
            <AutoTextarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={save} placeholder="Notizen, Eindrücke, nächste Schritte…" minRows={5} />
          </div>
          <div className="autosave-indicator">
            <span className="dot" style={{ background: saved ? "var(--accent)" : "var(--green)" }} />
            {saved ? "Gespeichert." : "Wird beim Verlassen gespeichert."}
          </div>
        </>
      )}
    </div>
  );
}

function DetailsTab({ app, stage, url, onUrlChange, onSave }: {
  app: Application; stage: string;
  url: string; onUrlChange: (url: string) => void;
  onSave: (patch: Partial<Application>) => void;
}) {
  const [description, setDescription] = useState(app.description ?? "");
  const [descSaved,   setDescSaved]   = useState(false);
  const [descExpanded,  setDescExpanded]  = useState(false);
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

  return (
    <>
      {/* Übersicht-Inhalt */}
      <OverviewTab app={app} stage={stage} url={url} onUrlChange={onUrlChange} onSave={onSave} />

      {/* Kontakte */}
      <ContactsSection app={app} />

      {/* Notizen */}
      <NotesSection app={app} onSave={onSave} />

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
  const { driveNameFolder, driveNameDoc } = useUiStore();
  // driveApplicationsFolderId is now per-user in the profile — fetch from API
  const [driveApplicationsFolderId, setDriveApplicationsFolderId_] = useState("");
  useEffect(() => {
    api.get<{ driveApplicationsFolderId?: string | null }>("/api/profile")
      .then(r => setDriveApplicationsFolderId_(r.data.driveApplicationsFolderId ?? ""))
      .catch(() => {});
  }, []);
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
// ─── Drive Folder Button (CV Phase) ──────────────────────────────────────────
function DriveFolderBtn({ app, onSave }: { app: Application; onSave: (patch: Partial<Application>) => void }) {
  const { driveNameFolder } = useUiStore();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const hasFolderAlready = !!(app as Application & { googleFolderId?: string }).googleFolderId;

  const createFolder = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (creating || hasFolderAlready) return;
    setCreating(true);
    try {
      const r = await api.post<{ folderId: string; folderUrl: string }>(`/api/applications/${app.id}/drive/init-folder`, {
        folderRule: driveNameFolder || undefined,
      });
      onSave({ googleFolderId: r.data.folderId, googleFolderUrl: r.data.folderUrl } as Partial<Application>);
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["application", app.id] });
      setToast("Ordner erstellt ✓");
      setTimeout(() => setToast(null), 2500);
    } catch {
      setToast("Ordner-Erstellung fehlgeschlagen");
      setTimeout(() => setToast(null), 2500);
    } finally { setCreating(false); }
  };

  const folderUrl = (app as Application & { googleFolderUrl?: string }).googleFolderUrl ?? "";

  return (
    <div style={{ position: "relative" }}>
      <button
        className="btn btn-secondary"
        onClick={hasFolderAlready ? () => window.open(folderUrl, "_blank") : createFolder}
        disabled={creating}
        title={hasFolderAlready ? "Google Drive Ordner öffnen" : "Google Drive Ordner erstellen"}
        style={{
          fontSize: 10, padding: "10px 8px", minHeight: 58,
          flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 0, whiteSpace: "normal",
          ...(hasFolderAlready ? { borderColor: "var(--score-high)", color: "var(--score-high)" } : {}),
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, width: "100%" }}>
          <FolderPlus width={12} height={12} />
          <span style={{ textAlign: "center", lineHeight: 1.3 }}>
            {creating ? "Erstelle…" : hasFolderAlready ? "Drive-Ordner öffnen ↗" : "Drive-Ordner anlegen"}
          </span>
        </div>
      </button>
      {toast && (
        <div className="toast-enter" style={{
          position: "absolute", bottom: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)",
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6,
          padding: "4px 10px", fontSize: 11, color: "var(--fg-1)", whiteSpace: "nowrap", zIndex: 10,
        }}>{toast}</div>
      )}
    </div>
  );
}

function StageAiActions({ app, onSave, onAiResult }: {
  app: Application;
  onSave?: (patch: Partial<Application>) => void;
  onAiResult?: (id: string, data: unknown) => void;
}) {
  const { ai } = useUiStore();
  const { t } = useTranslation("actions");
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

  const updateCvHighlights    = (v: CvHighlights | null)        => { setCvHighlights(v);     if (v) onAiResult?.("cv-highlights", v);     };
  const updateInterviewPrep   = (v: InterviewPrep | null)       => { setInterviewPrep(v);    if (v) onAiResult?.("interview-prep", v);    };
  const updateSalaryTips      = (v: SalaryTips | null)          => { setSalaryTips(v);       if (v) onAiResult?.("salary-tips", v);       };
  const updateSalaryCheck     = (v: SalaryCheck | null)         => { setSalaryCheck(v);      if (v) onAiResult?.("salary-check", v);      };
  const updateAtsKeywords     = (v: AtsKeywords | null)         => { setAtsKeywords(v);      if (v) onAiResult?.("ats-keywords", v);      };
  const updateCompanyResearch = (v: CompanyResearch | null)     => { setCompanyResearch(v);  if (v) onAiResult?.("company-research", v);  };
  const updateAckermannScript = (v: AckermannScript | null)     => { setAckermannScript(v);  if (v) onAiResult?.("ackermann-script", v);  };
  const updateLetterReview    = (v: LetterReview | null)        => { setLetterReview(v);     if (v) onAiResult?.("letter-review", v);     };
  const updateOpeningSentences= (v: OpeningSentences | null)    => { setOpeningSentences(v); if (v) onAiResult?.("opening-sentences", v); };
  const updateOnboarding      = (v: OnboardingChecklist | null) => { setOnboarding(v);       if (v) onAiResult?.("onboarding", v);        };
  const updateGlassdoor       = (v: GlassdoorData | null)       => { setGlassdoor(v);        if (v) onAiResult?.("glassdoor-check", v);   };
  const updateKununu          = (v: KununuData | null)           => { setKununu(v);           if (v) onAiResult?.("kununu-check", v);      };
  const updateLinkedin        = (v: LinkedinData | null)         => { setLinkedin(v);         if (v) onAiResult?.("linkedin-profile", v);  };

  void salaryCheck; void atsKeywords; void companyResearch; void ackermannScript;
  void letterReview; void openingSentences; void onboarding; void glassdoor; void kununu; void linkedin;

  // Application language — settable from the CV phase
  const [lang, setLang] = useState<"de" | "en">((app as Application & { language?: string }).language === "en" ? "en" : "de");
  const saveLang = (l: "de" | "en") => {
    setLang(l);
    onSave?.({ language: l } as Partial<Application>);
  };

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
  const queryClient = useQueryClient();

  const run = async (key: string, fn: () => Promise<void>) => {
    if (ai.provider === "none") { setErr("KI-Modell in Settings konfigurieren"); return; }
    setErr(null); setLoading(key);
    try {
      await fn();
      setResultTimes(prev => ({ ...prev, [key]: new Date() }));
      // Refresh application data so aiResultsCache is up-to-date in all views
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["application", app.id] });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Fehler";
      setErr(msg);
    } finally { setLoading(null); }
  };

  const AiBtn = ({ id, label, icon }: { id: string; label: string; icon: React.ReactNode }) => {
    const ts = resultTimes[id];
    const tsLabel = ts ? ts.toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : undefined;
    const tooltip = t(`${id}.tooltip`, { defaultValue: label });
    return (
    <button className="btn btn-secondary" style={{
      fontSize: 10, padding: "10px 8px", minHeight: 58,
      flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 0, position: "relative", whiteSpace: "normal",
    }} disabled={!!loading}
      data-tooltip={tooltip}
      title={ts && tsLabel ? `Erstellt: ${tsLabel}` : undefined}
      onClick={() => run(id, async () => {
        if (id === "cv-doc") {
          const r = await api.post<{ docUrl?: string }>(`/api/applications/${app.id}/ai/cv-doc`, aiBody);
          if (r.data.docUrl) window.open(r.data.docUrl, "_blank");
          else setErr("Google Drive nicht verbunden. Bitte in Settings → Integrationen verbinden.");
        } else if (id === "cv-highlights") {
          const r = await api.post<CvHighlights>(`/api/applications/${app.id}/ai/cv-highlights`, aiBody);
          updateCvHighlights(r.data);
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
        } else if (id === "match-score") {
          const r = await api.post<MatchResult>(`/api/applications/${app.id}/match-score`, aiBody);
          onAiResult?.("match-score", r.data);
          onSave?.({ matchScore: r.data.score } as Partial<Application>);
          queryClient.invalidateQueries({ queryKey: ["applications"] });
          queryClient.invalidateQueries({ queryKey: ["application", app.id] });
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
          <AiBtn id="match-score"     icon={<Sparks width={12} height={12} />}   label="Match Score" />
          <AiBtn id="glassdoor-check" icon={<Building width={12} height={12} />} label="Glassdoor Rating" />
          <AiBtn id="kununu-check"    icon={<Star width={12} height={12} />}     label="Kununu Rating" />
          <AiBtn id="linkedin-profile" icon={<Linkedin width={12} height={12} />} label="LinkedIn Profil" />
          <AiBtn id="salary-check"   icon={<Coins width={12} height={12} />}     label="Gehalts-Check" />
          <AiBtn id="ats-keywords"   icon={<Search width={12} height={12} />}    label="ATS-Keywords" />
        </div>
      )}

      {/* CV Phase */}
      {showCv && (
        <>
          {/* Language selector — required first step in CV phase */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
              Bewerbungssprache — gilt für alle KI-Inhalte
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {(["de", "en"] as const).map(l => (
                <button key={l} onClick={() => saveLang(l)} style={{
                  flex: 1, padding: "7px 8px", borderRadius: 6,
                  border: `1px solid ${lang === l ? "var(--accent)" : "var(--border)"}`,
                  background: lang === l ? "var(--accent-08)" : "var(--surface-2)",
                  color: lang === l ? "var(--accent)" : "var(--fg-2)",
                  fontSize: 12, fontWeight: lang === l ? 700 : 400,
                  cursor: "pointer", fontFamily: "var(--font-sans)",
                }}>
                  <FlagIcon lang={l} size={18} />
                  {l === "de" ? "Deutsch" : "English"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 6, marginBottom: 12 }}>
            <AiBtn id="cv-highlights" icon={<BrainElectricity width={12} height={12} />} label="CV-Highlights" />
            <AiBtn id="cv-doc"        icon={<PageEdit width={12} height={12} />}          label="Google Doc aus Master-CV" />
            {onSave && <DriveFolderBtn app={app} onSave={onSave} />}
          </div>
        </>
      )}

      {/* Letter Phase — cover-letter is now a tile; only supplementary actions remain */}
      {showLetter && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 6, marginBottom: 12 }}>
          <AiBtn id="letter-review"    icon={<ChatBubbleCheck width={12} height={12} />} label="Anschreiben reviewen" />
          <AiBtn id="opening-sentences" icon={<Spark width={12} height={12} />}          label="3 Eröffnungssätze" />
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

function ProcessTab({ app, onSave, onAiResult, aiResults }: {
  app: Application;
  onSave?: (patch: Partial<Application>) => void;
  onAiResult?: (id: string, data: unknown) => void;
  aiResults?: Record<string, { data: unknown; createdAt: Date }>;
}) {
  const { ai } = useUiStore();
  const queryClient = useQueryClient();
  const { data: activities = [], refetch } = useQuery<ApplicationActivity[]>({
    queryKey: ["activities", app.id],
    queryFn: () => api.get(`/api/applications/${app.id}/activities`).then((r) => r.data)
  });
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState("note");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);

  // Expand-Logik for the content blocks
  const [interviewExpanded, setInterviewExpanded] = useState(false);
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

      {/* Phase KI-Kacheln */}
      {(() => {
        const stageTileIds = STAGE_TILES[app.stage] ?? [];
        if (stageTileIds.length === 0) return null;
        return (
          <>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-4)", letterSpacing: "0.07em", textTransform: "uppercase", marginTop: 20, marginBottom: 8 }}>KI-Auswertungen</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 6, marginBottom: 16 }}>
              {stageTileIds.map(id => (
                <AiResultTile key={id} id={id} entry={aiResults?.[id] ?? null}
                  onExpand={() => setExpandedResultId(id)}
                  onRun={buildTileRunner(id, app.id, ai, queryClient, (tid, data) => onAiResult?.(tid, data))} />
              ))}
            </div>
          </>
        );
      })()}
      {expandedResultId && (
        <TileExpandView
          id={expandedResultId}
          entry={aiResults?.[expandedResultId] ?? null}
          appId={app.id}
          onClose={() => setExpandedResultId(null)}
          onRegister={(id, data) => { onAiResult?.(id, data); }}
        />
      )}

      {/* 2. Aktivitäten */}
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

function KiInhalteTab({ app, aiResults, onAiResultUpdate }: {
  app: Application;
  aiResults?: Record<string, { data: unknown; createdAt: Date }>;
  onAiResultUpdate?: (id: string, data: unknown) => void;
}) {
  const { ai } = useUiStore();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [stepN, setStepN] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);

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
      // Push into tile registry so the tile updates immediately
      onAiResultUpdate?.("match-score", res.data);
      // Persist: refresh cache so matchScore badge + next drawer open show correct data
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["application", app.id] });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Unbekannter Fehler";
      setError(msg);
    } finally {
      setRunning(false);
    }
  };

  const scoreColor = result ? (result.score >= 75 ? "#34d399" : result.score >= 50 ? "#fbbf24" : "#f87171") : "var(--fg-3)";

  // Sync result state from aiResults registry (updated externally when tile re-runs)
  const registryResult = aiResults?.["match-score"]?.data as MatchResult | undefined;
  const displayResult = result ?? registryResult ?? null;

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

      {/* Live analysis steps */}
      {running && (
        <div className="card" style={{ background: "var(--surface-2)", padding: 14, marginBottom: 14 }}>
          <AgentStep done={stepN >= 1} active={stepN === 0} label="Profil laden" meta="Master-CV · Dokumente · Stichpunkte" />
          <AgentStep done={stepN >= 2} active={stepN === 1} label="Stellenbeschreibung analysieren" meta="Anforderungen · Skills · Kontext" />
          <AgentStep done={stepN >= 3} active={stepN === 2} label="Abgleich berechnen" meta="Fachkompetenz · Erfahrung · Culture Fit" />
          <AgentStep done={stepN >= 4} active={stepN === 3} label="Bewertung finalisieren" meta="Score · Stärken · Lücken · Begründung" />
        </div>
      )}

      {/* Alle KI-Auswertungen — match-score tile is first */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 6 }}>
        {ALL_TILE_IDS.map(id => {
          // match-score uses the local runAnalysis (has AgentStep animation)
          const runHandler = id === "match-score"
            ? runAnalysis
            : buildTileRunner(id, app.id, ai, queryClient, (tid, data) => {
                onAiResultUpdate?.(tid, data);
              });
          return (
            <AiResultTile key={id} id={id}
              entry={id === "match-score" && displayResult ? { data: displayResult, createdAt: aiResults?.["match-score"]?.createdAt ?? new Date() } : (aiResults?.[id] ?? null)}
              onExpand={() => setExpandedResultId(id)}
              onRun={runHandler} />
          );
        })}
      </div>
      {expandedResultId && (
        <TileExpandView
          id={expandedResultId}
          entry={expandedResultId === "match-score" && displayResult ? { data: displayResult, createdAt: aiResults?.["match-score"]?.createdAt ?? new Date() } : (aiResults?.[expandedResultId] ?? null)}
          appId={app.id}
          onClose={() => setExpandedResultId(null)}
          onRegister={(id, data) => { onAiResultUpdate?.(id, data); if (id === "match-score") setResult(data as MatchResult); }}
        />
      )}
    </>
  );
}

// ─── Contacts Tab (standalone, kept for potential future use) ─────────────────────────────────────────────
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
type Props = { app: Application; onClose: () => void; onArchived?: () => void };

export function DetailDrawer({ app, onClose, onArchived }: Props) {
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

  // Live-sync: whenever the React Query cache for this application is refreshed
  // (e.g. after an AI call or background refetch), merge fresh DB data into the registry.
  // This ensures results generated in other sessions or while the drawer was closed are shown.
  const { data: freshApp } = useQuery<Application>({
    queryKey: ["application", app.id],
    queryFn: () => api.get<Application>(`/api/applications/${app.id}`).then(r => r.data),
    staleTime: 0,          // always consider stale so it refetches on mount
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Merge fresh data into registry whenever the live query or parent prop updates
  useEffect(() => {
    const source = freshApp ?? app;
    const patch: Record<string, { data: unknown; createdAt: Date }> = {};

    if ((source as Application & { glassdoorData?: string }).glassdoorData) {
      try {
        const d = JSON.parse((source as Application & { glassdoorData?: string }).glassdoorData!);
        patch["glassdoor-check"] = { data: d, createdAt: d.updatedAt ? new Date(d.updatedAt) : new Date() };
      } catch {}
    }
    if ((source as Application & { kununuData?: string }).kununuData) {
      try {
        const d = JSON.parse((source as Application & { kununuData?: string }).kununuData!);
        patch["kununu-check"] = { data: d, createdAt: d.updatedAt ? new Date(d.updatedAt) : new Date() };
      } catch {}
    }
    if ((source as Application & { linkedinData?: string }).linkedinData) {
      try {
        const d = JSON.parse((source as Application & { linkedinData?: string }).linkedinData!);
        patch["linkedin-profile"] = { data: d, createdAt: d.updatedAt ? new Date(d.updatedAt) : new Date() };
      } catch {}
    }
    const prep = source.stage === "interview_1" ? source.interview1Prep : source.stage === "interview_2" ? source.interview2Prep : null;
    if (prep) {
      try { patch["interview-prep"] = { data: JSON.parse(prep), createdAt: new Date() }; } catch {}
    }
    // Inject match-score from dedicated DB columns
    if (source.matchScore != null && source.matchDetails) {
      try { patch["match-score"] = { data: JSON.parse(source.matchDetails as string), createdAt: new Date() }; } catch {}
    }
    const cache = (source as Application & { aiResultsCache?: string }).aiResultsCache;
    if (cache) {
      try {
        const parsed = JSON.parse(cache) as Record<string, Record<string, unknown> & { _savedAt?: string }>;
        for (const [key, entry] of Object.entries(parsed)) {
          patch[key] = { data: entry, createdAt: entry._savedAt ? new Date(entry._savedAt) : new Date() };
        }
      } catch {}
    }
    if (Object.keys(patch).length > 0) {
      setAiResultsRegistry(prev => {
        const merged = { ...prev };
        for (const [key, dbEntry] of Object.entries(patch)) {
          const memEntry = prev[key];
          // Use the fresher entry based on timestamp.
          // DB wins when:  (a) no in-memory entry yet, or
          //                (b) DB timestamp is strictly newer (result was generated while drawer was closed)
          // In-memory wins when it was just generated in this session (its timestamp is newer).
          if (!memEntry || dbEntry.createdAt.getTime() > memEntry.createdAt.getTime()) {
            merged[key] = dbEntry;
          }
        }
        return merged;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshApp]);

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

  // effectiveApp: merges freshDB data with the locally-selected stage so all tabs
  // react immediately to stage changes without waiting for the DB refetch.
  const effectiveApp = { ...(freshApp ?? app), stage } as Application;

  const handleArchive = (reason?: string) => {
    patchMutation.mutate({ archived: "true", archiveReason: reason } as Partial<Application>);
    queryClient.invalidateQueries({ queryKey: ["applications"] });
    onArchived?.();
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
                    onClick={() => setTab("ki")}
                    title="KI-Inhalte öffnen"
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
          {/* Use freshApp wherever available so DB data is always current after tab switches */}
          {tab === "process"   && <ProcessTab    app={effectiveApp} onSave={(p) => patchMutation.mutate(p)} onAiResult={registerAiResult} aiResults={aiResultsRegistry} />}
          {tab === "details"   && <DetailsTab    app={effectiveApp} stage={stage} url={url} onUrlChange={setUrl} onSave={(p) => patchMutation.mutate(p)} />}
          {tab === "documents" && <DocumentsTab  app={effectiveApp} />}
          {tab === "ki"        && <KiInhalteTab  app={effectiveApp} aiResults={aiResultsRegistry} onAiResultUpdate={updateAiResult} />}
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

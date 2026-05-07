import { useState, useCallback, useRef, useEffect } from "react";
import {
  X, ExternalLink, MoreHorizontal, Check, Sparkles, RefreshCw,
  ChevronRight, Link2, Plus, Mail, Phone, Calendar, FileText,
  Loader, Trash2, Edit3, MessageSquare, Clock
} from "lucide-react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import type {
  Application, ApplicationDocument, ApplicationActivity, ApplicationContact
} from "@application-pal/shared";
import { api } from "../lib/api";

type Tab = "overview" | "description" | "documents" | "process" | "agent" | "contacts" | "notes";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview",    label: "Übersicht"      },
  { id: "description", label: "Beschreibung"   },
  { id: "documents",   label: "Dokumente"      },
  { id: "process",     label: "Prozess"        },
  { id: "agent",       label: "AI Agent"       },
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
    placeholder={placeholder} rows={minRows} style={{ resize: "none", overflow: "hidden" }} />;
}

function AgentStep({ done, active, label, meta }: { done: boolean; active: boolean; label: string; meta?: string }) {
  return (
    <div className={`agent-step${done ? " done" : ""}${active ? " active" : ""}`}>
      <div className="pip">
        {done ? <Check size={11} /> : active
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
  const activeIdx = STAGES.findIndex((s) => s.id === stage);
  const STAGE_COLORS: Record<string, string> = {
    import_validating: "#94a3b8", preparing_cv: "#60a5fa", preparing_letter: "#22d3ee",
    application_sent: "#a78bfa", pending: "#fbbf24", interview_1: "#34d399",
    interview_2: "#10b981", rejected: "#f87171", accepted: "#84cc16"
  };
  return (
    <div style={{ padding: "12px 0 8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 0, position: "relative" }}>
        {STAGES.map((s, i) => {
          const isPast   = i < activeIdx;
          const isActive = i === activeIdx;
          const isFuture = i > activeIdx;
          const color = STAGE_COLORS[s.id];
          return (
            <div key={s.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                {i > 0 && (
                  <div style={{ flex: 1, height: 2, background: isPast || isActive ? color : "var(--border)", transition: "background 0.2s" }} />
                )}
                <div style={{
                  width: isActive ? 14 : 10, height: isActive ? 14 : 10, borderRadius: "50%",
                  background: isPast || isActive ? color : "var(--border-2)",
                  border: isActive ? `2px solid ${color}` : "none",
                  boxShadow: isActive ? `0 0 0 3px ${color}28` : "none",
                  flexShrink: 0, transition: "all 0.2s",
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  {isPast && <Check size={6} color="#fff" />}
                </div>
                {i < STAGES.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: isPast ? color : "var(--border)", transition: "background 0.2s" }} />
                )}
              </div>
              <div style={{
                fontSize: 9, fontWeight: isActive ? 700 : 500,
                color: isActive ? color : isFuture ? "var(--fg-3)" : "var(--fg-3)",
                whiteSpace: "nowrap", textAlign: "center"
              }}>
                {s.short}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Overview Tab ──────────────────────────────────────────────
function OverviewTab({ app, onSave }: { app: Application; onSave: (patch: Partial<Application>) => void }) {
  const [company, setCompany] = useState(app.company);
  const [role, setRole]       = useState(app.role);
  const [location, setLocation] = useState(app.location ?? "");
  const [stage, setStage]     = useState(app.stage);
  const [salary, setSalary]   = useState(app.salary ?? "");
  const [url, setUrl]         = useState(app.url ?? "");
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
      <StageProgressBar stage={stage} />

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
      <div className="field">
        <label>Firma</label>
        <input value={company} onChange={(e) => setCompany(e.target.value)} onBlur={() => save({ company })} />
      </div>
      <div className="field">
        <label>Rolle</label>
        <input value={role} onChange={(e) => setRole(e.target.value)} onBlur={() => save({ role })} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field">
          <label>Ort</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} onBlur={() => save({ location })} />
        </div>
        <div className="field">
          <label>Stage</label>
          <select value={stage} onChange={(e) => { setStage(e.target.value as Application["stage"]); save({ stage: e.target.value as Application["stage"] }); }}>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field">
          <label>Salary</label>
          <input value={salary} onChange={(e) => setSalary(e.target.value)} onBlur={() => save({ salary })} placeholder="e.g. €80–100k" />
        </div>
        <div className="field">
          <label>Original URL</label>
          <div style={{ position: "relative" }}>
            <Link2 size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-3)", pointerEvents: "none" }} />
            <input value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => save({ url })}
              placeholder="https://…" style={{ paddingLeft: 28, paddingRight: url ? 28 : undefined }} />
            {url && <a href={url} target="_blank" rel="noreferrer" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "var(--accent)", display: "flex" }}><ExternalLink size={12} /></a>}
          </div>
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
            <ExternalLink size={11} /> Original öffnen
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

// ─── Documents Tab ────────────────────────────────────────────
const DOC_STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  draft:       { bg: "rgba(148,163,184,0.12)", color: "#94a3b8", label: "Entwurf" },
  in_progress: { bg: "rgba(251,191,36,0.12)",  color: "#fbbf24", label: "In Arbeit" },
  final:       { bg: "rgba(52,211,153,0.14)",  color: "#34d399", label: "Final" },
  sent:        { bg: "rgba(96,165,250,0.12)",  color: "#60a5fa", label: "Gesendet" },
};

function DocumentsTab({ app }: { app: Application }) {
  const { data: docs = [], refetch } = useQuery<ApplicationDocument[]>({
    queryKey: ["documents", app.id],
    queryFn: () => api.get(`/api/applications/${app.id}/documents`).then((r) => r.data)
  });
  const [creating, setCreating] = useState<"cv" | "letter" | null>(null);
  const [newName, setNewName] = useState("");
  const [googleConnected, setGoogleConnected] = useState(false);

  useEffect(() => {
    api.get<{ connected: boolean }>("/api/google/status").then((r) => setGoogleConnected(r.data.connected)).catch(() => {});
  }, []);

  const create = async (type: "cv" | "letter") => {
    const name = newName.trim() || (type === "cv" ? "Lebenslauf" : "Anschreiben");
    let googleDocUrl: string | undefined;
    let googleDocId: string | undefined;
    if (googleConnected) {
      try {
        const res = await api.post<{ docId: string; docUrl: string }>("/api/google/docs/create", { title: `${name} — ${app.company}` });
        googleDocId = res.data.docId;
        googleDocUrl = res.data.docUrl;
      } catch { /* fall through without Google Doc */ }
    }
    await api.post(`/api/applications/${app.id}/documents`, { type, name, status: "draft", googleDocId, googleDocUrl });
    setNewName("");
    setCreating(null);
    refetch();
  };

  const updateStatus = async (docId: string, status: string) => {
    await api.patch(`/api/applications/${app.id}/documents/${docId}`, { status });
    refetch();
  };

  const deleteDoc = async (docId: string) => {
    await api.delete(`/api/applications/${app.id}/documents/${docId}`);
    refetch();
  };

  const grouped = { cv: docs.filter((d) => d.type === "cv"), letter: docs.filter((d) => d.type === "letter") };

  return (
    <>
      {!googleConnected && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", fontSize: 12, color: "#fbbf24", marginBottom: 12 }}>
          Google Drive nicht verbunden — Dokumente werden lokal ohne Google Docs gespeichert.{" "}
          <a href="/settings" style={{ color: "inherit", fontWeight: 700 }}>Verbinden →</a>
        </div>
      )}

      {(["cv", "letter"] as const).map((type) => (
        <div key={type} style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <div className="eyebrow" style={{ flex: 1 }}>{type === "cv" ? "Lebenslauf" : "Anschreiben"}</div>
            <button className="btn btn-ghost" style={{ fontSize: 11, gap: 4, padding: "4px 8px" }}
              onClick={() => setCreating(creating === type ? null : type)}>
              <Plus size={11} /> Neu
            </button>
          </div>

          {creating === type && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10, padding: 10, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder={type === "cv" ? "Lebenslauf v1" : "Anschreiben v1"}
                style={{ flex: 1, border: "none", background: "transparent", color: "var(--fg-1)", fontSize: 12, outline: "none" }}
                onKeyDown={(e) => e.key === "Enter" && create(type)} autoFocus />
              <button className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => create(type)}>
                {googleConnected ? "Erstellen + Google Doc" : "Erstellen"}
              </button>
              <button className="btn btn-ghost btn-icon" onClick={() => setCreating(null)}><X size={13} /></button>
            </div>
          )}

          {grouped[type].length === 0 && (
            <div style={{ color: "var(--fg-3)", fontSize: 12, padding: "12px 0", textAlign: "center", border: "1px dashed var(--border)", borderRadius: 8 }}>
              Noch keine {type === "cv" ? "Lebensläufe" : "Anschreiben"}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {grouped[type].map((doc) => {
              const status = DOC_STATUS_STYLES[doc.status ?? "draft"] ?? DOC_STATUS_STYLES.draft;
              return (
                <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}>
                  <FileText size={14} style={{ color: "var(--fg-3)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)" }}>{doc.name}</div>
                    <div style={{ fontSize: 10, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>v{doc.version ?? 1}</div>
                  </div>
                  <select value={doc.status ?? "draft"} onChange={(e) => updateStatus(doc.id, e.target.value)}
                    style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 999, border: "1px solid", borderColor: status.color, background: status.bg, color: status.color, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                    {Object.entries(DOC_STATUS_STYLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  {doc.googleDocUrl && (
                    <a href={doc.googleDocUrl} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ fontSize: 11, padding: "4px 8px", gap: 4 }}>
                      <ExternalLink size={11} /> Docs
                    </a>
                  )}
                  <button className="btn btn-ghost btn-icon" onClick={() => deleteDoc(doc.id)}><Trash2 size={12} /></button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

// ─── Process Tab (Timeline) ───────────────────────────────────
const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  note:         <MessageSquare size={13} />,
  email:        <Mail size={13} />,
  call:         <Phone size={13} />,
  interview:    <Calendar size={13} />,
  deadline:     <Clock size={13} />,
  stage_change: <ChevronRight size={13} />,
  document:     <FileText size={13} />
};
const ACTIVITY_TYPES = [
  { id: "note", label: "Notiz" }, { id: "email", label: "E-Mail" },
  { id: "call", label: "Anruf" }, { id: "interview", label: "Interview" },
  { id: "deadline", label: "Deadline" },
];

function ProcessTab({ app }: { app: Application }) {
  const { data: activities = [], refetch } = useQuery<ApplicationActivity[]>({
    queryKey: ["activities", app.id],
    queryFn: () => api.get(`/api/applications/${app.id}/activities`).then((r) => r.data)
  });
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState("note");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

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
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn btn-primary" style={{ fontSize: 11, gap: 4, padding: "5px 10px" }} onClick={() => setAdding((v) => !v)}>
          <Plus size={11} /> Aktivität
        </button>
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
        <div style={{ color: "var(--fg-3)", fontSize: 12, textAlign: "center", padding: "40px 0", border: "1px dashed var(--border)", borderRadius: 8 }}>
          Noch keine Aktivitäten. Füge Notizen, E-Mails oder Interview-Termine hinzu.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column" }}>
        {activities.map((act, i) => (
          <div key={act.id} style={{ display: "flex", gap: 12, paddingBottom: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent-08)", border: "1px solid var(--accent-15)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", flexShrink: 0 }}>
                {ACTIVITY_ICONS[act.type] ?? <MessageSquare size={13} />}
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
            <button className="btn btn-ghost btn-icon" style={{ flexShrink: 0, padding: 4 }} onClick={() => del(act.id)}><Trash2 size={11} /></button>
          </div>
        ))}
      </div>
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
function AgentTab({ app }: { app: Application }) {
  const [doc, setDoc] = useState<AgentDoc>("cv");
  const [activeVer, setActiveVer] = useState("v3");
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [stepN, setStepN] = useState(4);
  const regen = () => {
    setRunning(true); setStepN(0);
    let s = 0; const tick = () => { s += 1; setStepN(s); if (s === 4) { setRunning(false); return; } setTimeout(tick, 700); };
    setTimeout(tick, 400);
  };
  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
        {(["cv", "letter"] as AgentDoc[]).map((d) => (
          <div key={d} className={`doc-tab-card${doc === d ? " active" : ""}`} onClick={() => setDoc(d)}>
            <div className="doc-tab-title">{d === "cv" ? "Curriculum Vitae" : "Motivation Letter"}</div>
            <div className="doc-tab-sub">{d === "cv" ? "3 sections tailored" : "Draft in progress"}</div>
            <div className="doc-tab-badge">{d === "cv" ? "v3" : "v1"}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{ background: "var(--surface-2)", padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div className="eyebrow">Agent run · {running ? "in progress" : "completed"}</div>
          <span className="mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>2.4s · 1,840 tokens</span>
        </div>
        <AgentStep done={stepN >= 1} active={running && stepN === 0} label="Reading job description" meta="extracting key requirements" />
        <AgentStep done={stepN >= 2} active={running && stepN === 1} label="Matching skills against base" meta="34 candidate bullets · 12 selected" />
        <AgentStep done={stepN >= 3} active={running && stepN === 2} label="Drafting tailored sections" meta="Summary · Experience · Skills" />
        <AgentStep done={stepN >= 4} active={running && stepN === 3} label="Polishing tone" meta="formal · concise · DACH-conventional" />
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <div className="eyebrow">Diff · base vs. tailored</div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-secondary btn-icon" onClick={regen}><RefreshCw size={13} /></button>
            <button className="btn btn-primary" style={{ gap: 5 }}><Check size={13} /> Approve</button>
          </div>
        </div>
        <div className="card" style={{ padding: 14, lineHeight: 1.7, fontSize: 13 }}>
          {MOCK_CV_DIFF.map((line, i) => (
            <span key={i}>
              {line.type === "remove"  && <span className="diff-removed">{line.text}</span>}
              {line.type === "add"     && <span className="diff-added">{line.text}</span>}
              {line.type === "context" && <span style={{ color: "var(--fg-2)" }}>{line.text} </span>}
            </span>
          ))}
        </div>
      </div>
      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Version history</div>
        {MOCK_VERSIONS.map((v) => (
          <div key={v.id} className={`version-item${activeVer === v.id ? " active" : ""}`} onClick={() => setActiveVer(v.id)}>
            <div style={{ flex: 1 }}>
              <div className="version-label">{v.label}</div>
              <div className="version-meta">{v.when} · {v.note}</div>
            </div>
            <ChevronRight size={13} style={{ color: "var(--fg-3)" }} />
          </div>
        ))}
      </div>
      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Regenerate with prompt</div>
        <div className="regen-bar">
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Lean harder into platform/DX work…" onKeyDown={(e) => { if (e.key === "Enter") regen(); }} />
          <button className="btn btn-primary btn-icon" onClick={regen} disabled={running}><Sparkles size={13} /></button>
        </div>
      </div>
    </>
  );
}

// ─── Contacts Tab ─────────────────────────────────────────────
function ContactsTab({ app }: { app: Application }) {
  const { data: contacts = [], refetch } = useQuery<ApplicationContact[]>({
    queryKey: ["contacts", app.id],
    queryFn: () => api.get(`/api/applications/${app.id}/contacts`).then((r) => r.data)
  });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", role: "recruiter", email: "", phone: "", linkedinUrl: "", notes: "" });

  const add = async () => {
    if (!form.name.trim()) return;
    await api.post(`/api/applications/${app.id}/contacts`, { ...form, name: form.name.trim() });
    setForm({ name: "", role: "recruiter", email: "", phone: "", linkedinUrl: "", notes: "" });
    setAdding(false); refetch();
  };

  const del = async (cId: string) => { await api.delete(`/api/applications/${app.id}/contacts/${cId}`); refetch(); };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn btn-primary" style={{ fontSize: 11, gap: 4, padding: "5px 10px" }} onClick={() => setAdding((v) => !v)}>
          <Plus size={11} /> Kontakt
        </button>
      </div>

      {adding && (
        <div style={{ padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", marginBottom: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Name *</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Max Muster" autoFocus />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Rolle</label>
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                <option value="recruiter">Recruiter</option>
                <option value="hiring_manager">Hiring Manager</option>
                <option value="other">Sonstiges</option>
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>E-Mail</label>
              <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="kontakt@firma.de" type="email" />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Telefon</label>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+41 79 …" />
            </div>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>LinkedIn URL</label>
            <input value={form.linkedinUrl} onChange={(e) => setForm((f) => ({ ...f, linkedinUrl: e.target.value }))} placeholder="https://linkedin.com/in/…" />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-secondary" onClick={() => setAdding(false)}>Abbrechen</button>
            <button className="btn btn-primary" onClick={add}>Hinzufügen</button>
          </div>
        </div>
      )}

      {contacts.length === 0 && (
        <div style={{ color: "var(--fg-3)", fontSize: 12, textAlign: "center", padding: "40px 0", border: "1px dashed var(--border)", borderRadius: 8 }}>
          Noch keine Kontakte
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {contacts.map((c) => (
          <div key={c.id} style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--accent-08)", border: "1px solid var(--accent-15)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
              {c.name.slice(0, 1).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fg-1)" }}>{c.name}</div>
              {c.role && <div style={{ fontSize: 11, color: "var(--fg-3)" }}>{c.role === "recruiter" ? "Recruiter" : c.role === "hiring_manager" ? "Hiring Manager" : c.role}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                {c.email && <a href={`mailto:${c.email}`} style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--accent)", fontSize: 11, textDecoration: "none" }}><Mail size={11} />{c.email}</a>}
                {c.phone && <a href={`tel:${c.phone}`} style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--accent)", fontSize: 11, textDecoration: "none" }}><Phone size={11} />{c.phone}</a>}
                {c.linkedinUrl && <a href={c.linkedinUrl} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 3, color: "#0a66c2", fontSize: 11, textDecoration: "none" }}><ExternalLink size={11} />LinkedIn</a>}
              </div>
            </div>
            <button className="btn btn-ghost btn-icon" style={{ padding: 4 }} onClick={() => del(c.id)}><Trash2 size={12} /></button>
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

// ─── Main DetailDrawer ────────────────────────────────────────
type Props = { app: Application; onClose: () => void };

export function DetailDrawer({ app, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const queryClient = useQueryClient();

  const patchMutation = useMutation({
    mutationFn: (patch: Partial<Application>) =>
      api.patch(`/api/applications/${app.id}`, patch).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications"] })
  });

  const color = getCompanyColor(app.company);

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer" style={{ width: 760 }}>
        {/* Header */}
        <div className="drawer-head" style={{ flexDirection: "column", alignItems: "stretch", gap: 14, paddingBottom: 0, borderBottom: "none" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div className="avatar avatar-lg" style={{ background: color, border: "none", flexShrink: 0 }}>
              {app.company.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="eyebrow" style={{ marginBottom: 2 }}>{app.company}</div>
              <h2 style={{ margin: "0 0 6px", fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--fg-1)" }}>
                {app.role}
              </h2>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span className={`chip chip-stage stage-${app.stage}`}>
                  <span className="dot" />{STAGE_LABELS[app.stage] ?? app.stage}
                </span>
                {app.priority && app.priority !== "low" && (
                  <span className={`chip chip-priority-${app.priority}`}>{app.priority.charAt(0).toUpperCase() + app.priority.slice(1)}</span>
                )}
                {app.location && <span className="tag">{app.location}</span>}
                {app.salary && <span className="tag mono">{app.salary}</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {app.url && <a href={app.url} target="_blank" rel="noreferrer" className="btn btn-secondary"><ExternalLink size={13} /> Job</a>}
              <button className="btn btn-ghost btn-icon"><MoreHorizontal size={14} /></button>
              <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
            </div>
          </div>

          {/* Tabs — scrollable */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)", overflowX: "auto", gap: 0 }}>
            {TABS.map(({ id, label }) => (
              <button key={id} className={"tab" + (tab === id ? " active" : "")} onClick={() => setTab(id)} style={{ whiteSpace: "nowrap" }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="drawer-body" style={{ paddingTop: 16 }}>
          {tab === "overview"     && <OverviewTab     app={app} onSave={(p) => patchMutation.mutate(p)} />}
          {tab === "description"  && <DescriptionTab  app={app} onSave={(p) => patchMutation.mutate(p)} />}
          {tab === "documents"    && <DocumentsTab    app={app} />}
          {tab === "process"      && <ProcessTab      app={app} />}
          {tab === "agent"        && <AgentTab        app={app} />}
          {tab === "contacts"     && <ContactsTab     app={app} />}
          {tab === "notes"        && <NotesTab        app={app} onSave={(p) => patchMutation.mutate(p)} />}
        </div>
      </aside>
    </>
  );
}

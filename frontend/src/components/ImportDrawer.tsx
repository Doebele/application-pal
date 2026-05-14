import { useState, useRef, useEffect, useCallback } from "react";
import { X, Link, Sparkles, Check, ArrowRight, Cpu, Cloud, Plus, ChevronDown, Maximize2, Minimize2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useUiStore } from "../lib/store";

type ExtractionPhase = "idle" | "reading" | "extracting" | "done";

const STAGES = [
  { id: "import_validating", label: "Inbox",            color: "#94a3b8" },
  { id: "preparing_cv",      label: "Preparing CV",     color: "#60a5fa" },
  { id: "preparing_letter",  label: "Preparing Letter", color: "#22d3ee" },
  { id: "application_sent",  label: "Submitted",        color: "#a78bfa" },
  { id: "pending",           label: "Pending",          color: "#fbbf24" },
];

function Skeleton({ width = "100%", height = 28 }: { width?: string | number; height?: number }) {
  return <div className="skeleton" style={{ width, height, borderRadius: 6 }} />;
}

function AutoResizeTextarea({
  value, onChange, placeholder, minRows = 4, disabled = false, style = {}
}: {
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  minRows?: number;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);
  useEffect(() => { resize(); }, [value, resize]);
  return (
    <textarea ref={ref} value={value} onChange={onChange} placeholder={placeholder}
      disabled={disabled} rows={minRows} onInput={resize}
      style={{ resize: "none", overflow: "hidden", minHeight: minRows * 20 + "px", width: "100%", display: "block", ...style }}
    />
  );
}

function AgentStep({ done, active, label, meta }: {
  done: boolean; active: boolean; label: string; meta?: string;
}) {
  return (
    <div className={`agent-step${done ? " done" : ""}${active ? " active" : ""}`}>
      <div className="pip">
        {done
          ? <Check size={11} />
          : active
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

// ─── Compact stage picker ──────────────────────────────────────────────────────
function StagePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = STAGES.find((s) => s.id === value) ?? STAGES[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 10px", borderRadius: 999,
          border: `1px solid ${current.color}55`,
          background: `${current.color}14`,
          color: current.color,
          fontSize: 11, fontWeight: 700, cursor: "pointer",
          fontFamily: "var(--font-sans)", whiteSpace: "nowrap"
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 999, background: current.color, flexShrink: 0 }} />
        {current.label}
        <ChevronDown size={11} style={{ opacity: 0.7, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: 10, padding: 4, minWidth: 160,
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)"
        }}>
          {STAGES.map((s) => (
            <button key={s.id} onClick={() => { onChange(s.id); setOpen(false); }} style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              padding: "6px 10px", borderRadius: 7, border: "none",
              background: value === s.id ? `${s.color}14` : "transparent",
              color: value === s.id ? s.color : "var(--fg-1)",
              fontSize: 12, fontWeight: value === s.id ? 700 : 500,
              cursor: "pointer", fontFamily: "var(--font-sans)", textAlign: "left"
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color, flexShrink: 0 }} />
              {s.label}
              {value === s.id && <Check size={11} style={{ marginLeft: "auto", color: s.color }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type ExtractedRaw = {
  company: string | null;
  role: string | null;
  location: string | null;
  description: string;
  salary?: string | null;
  tags?: string | null;
  source?: string | null;
  logoUrl?: string | null;
};

type FormState = {
  company: string; role: string; location: string;
  salary: string; description: string; tags: string[]; source: string;
};

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

type Props = { onClose: () => void };

export function ImportDrawer({ onClose }: Props) {
  const queryClient = useQueryClient();
  const { ai } = useUiStore();
  const [mode, setMode]     = useState<"url" | "text">("url");
  const [url, setUrl]       = useState("");
  const [pasteText, setPasteText] = useState("");
  const [phase, setPhase]   = useState<ExtractionPhase>("idle");
  const [step, setStep]     = useState(0);
  const [stage, setStage]   = useState("import_validating");
  const [newTag, setNewTag] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoOk, setLogoOk]   = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  const [form, setForm] = useState<FormState>({
    company: "", role: "", location: "", salary: "", description: "", tags: [], source: ""
  });

  const usingAi = ai.provider !== "none";
  const ready   = phase === "done";
  const patch   = (field: keyof FormState, value: string | string[]) =>
    setForm((f) => ({ ...f, [field]: value }));

  const extractMutation = useMutation({
    mutationFn: () =>
      api.post<ExtractedRaw>("/api/applications/import", {
        url:  mode === "url"  ? url       : undefined,
        text: mode === "text" ? pasteText : undefined,
        ai: { provider: ai.provider, anthropicApiKey: ai.anthropicApiKey, lmStudioUrl: ai.lmStudioUrl, lmStudioModel: ai.lmStudioModel }
      }).then((r) => r.data)
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/api/applications", {
        company:     form.company     || "Unknown",
        role:        form.role        || "Unknown",
        location:    form.location    || null,
        salary:      form.salary      || null,
        description: form.description || null,
        tags:        form.tags.length > 0 ? JSON.stringify(form.tags) : null,
        source:      form.source      || null,
        url:         mode === "url" ? url || null : null,
        logoUrl:     logoUrl || null,
        stage
      }).then((r) => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["applications"] }); onClose(); }
  });

  const runExtraction = async () => {
    setPhase("reading"); setStep(0); setLogoUrl(null); setLogoOk(false); setDescExpanded(false);
    setForm({ company: "", role: "", location: "", salary: "", description: "", tags: [], source: "" });
    const advance = (n: number, p: ExtractionPhase) => setTimeout(() => { setStep(n); setPhase(p); }, n * 600);
    advance(1, "reading"); advance(2, "extracting"); advance(3, "extracting");
    try {
      const result = await extractMutation.mutateAsync();
      setTimeout(() => {
        setStep(4); setPhase("done");
        setLogoUrl(result.logoUrl ?? null); setLogoOk(false);
        setForm({
          company:     result.company     ?? "",
          role:        result.role        ?? "",
          location:    result.location    ?? "",
          salary:      result.salary      ?? "",
          description: result.description ?? "",
          tags:        parseTags(result.tags),
          source:      result.source      ?? ""
        });
      }, 2400);
    } catch { setPhase("idle"); }
  };

  const addTag    = (t: string) => { const tag = t.trim(); if (tag && !form.tags.includes(tag)) patch("tags", [...form.tags, tag]); setNewTag(""); };
  const removeTag = (t: string) => patch("tags", form.tags.filter((x) => x !== t));
  const canCreate = ready && (form.company || form.role);

  // Description expanded overlay — fixed, covers the drawer (540px from right)
  const descOverlay = descExpanded && (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: 540, zIndex: 60,
      background: "var(--surface)", borderLeft: "1px solid var(--border)",
      display: "flex", flexDirection: "column", padding: "20px 24px"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", flex: 1 }}>Beschreibung</span>
        <button className="btn btn-ghost btn-icon" style={{ padding: 4 }} onClick={() => setDescExpanded(false)} title="Minimieren">
          <Minimize2 size={13} />
        </button>
      </div>
      <textarea
        value={form.description}
        onChange={(e) => patch("description", e.target.value)}
        style={{ flex: 1, resize: "none", border: "none", background: "transparent", color: "var(--fg-1)", fontSize: 13, fontFamily: "var(--font-sans)", outline: "none", lineHeight: 1.7 }}
        placeholder="Stellenbeschreibung…"
      />
    </div>
  );

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer" style={{ width: 540 }}>
        {descOverlay}

        {/* Header with stage picker */}
        <div className="drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow" style={{ color: "var(--accent)" }}>Import</div>
            <h2 style={{ margin: "2px 0 0", fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--fg-1)" }}>
              Neue Bewerbung
            </h2>
          </div>
          {/* Stage picker in header */}
          <StagePicker value={stage} onChange={setStage} />
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ marginLeft: 4 }}><X size={16} /></button>
        </div>

        <div className="drawer-body" style={{ gap: 12 }}>

          {/* Mode + AI badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="mode-toggle">
              <button className={mode === "url"  ? "active" : ""} onClick={() => setMode("url")}>URL</button>
              <button className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}>Text</button>
            </div>
            <div style={{ flex: 1 }} />
            {usingAi ? (
              <span style={{
                display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999,
                background: ai.provider === "lm-studio" ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)",
                color: ai.provider === "lm-studio" ? "var(--green)" : "#f59e0b",
                fontSize: 10, fontWeight: 700, border: "1px solid",
                borderColor: ai.provider === "lm-studio" ? "rgba(16,185,129,0.25)" : "rgba(245,158,11,0.25)"
              }}>
                {ai.provider === "lm-studio" ? <Cpu size={10} /> : <Cloud size={10} />}
                {ai.provider === "lm-studio"
                  ? `LM Studio${ai.lmStudioModel ? ` · ${ai.lmStudioModel.split("/").pop()}` : ""}`
                  : "Anthropic"}
              </span>
            ) : (
              <span style={{ padding: "3px 9px", borderRadius: 999, background: "var(--surface-2)", color: "var(--fg-3)", fontSize: 10, fontWeight: 600, border: "1px solid var(--border)" }}>
                Regex
              </span>
            )}
          </div>

          {/* URL / Text input */}
          {mode === "url" ? (
            <div style={{ position: "relative" }}>
              <Link size={12} style={{ position: "absolute", left: 2, top: "50%", transform: "translateY(-50%)", color: "var(--fg-3)", pointerEvents: "none" }} />
              <input
                className="input-line"
                value={url} onChange={(e) => setUrl(e.target.value)}
                style={{ paddingLeft: 18, fontSize: 12 }}
                placeholder="https://…"
                onKeyDown={(e) => e.key === "Enter" && url && runExtraction()}
              />
            </div>
          ) : (
            <AutoResizeTextarea
              value={pasteText} onChange={(e) => setPasteText(e.target.value)}
              placeholder="Stellenbeschreibung hier einfügen…" minRows={4}
            />
          )}

          {/* Extract button */}
          <button
            className="btn btn-primary"
            style={{ alignSelf: "flex-start", fontSize: 12 }}
            onClick={runExtraction}
            disabled={phase === "reading" || phase === "extracting" || (!url && !pasteText)}
          >
            <Sparkles size={12} />
            {phase === "idle" ? (usingAi ? "Extract with AI" : "Extract (regex)") : phase === "done" ? "Erneut extrahieren" : "Extrahiere…"}
          </button>

          {/* Live timeline */}
          {phase !== "idle" && (
            <div className="card" style={{ background: "var(--surface-2)", padding: 12, gap: 0 }}>
              <div className="eyebrow" style={{ marginBottom: 8, fontSize: 8 }}>
                {usingAi ? `${ai.provider === "lm-studio" ? "LM Studio" : "Anthropic"} · Live` : "Regex · Live"}
              </div>
              <AgentStep done={step >= 1} active={step === 0} label="Fetching page"              meta={url || "text input"} />
              <AgentStep done={step >= 2} active={step === 1} label="Reading job description"    meta="analyzing content" />
              <AgentStep done={step >= 3} active={step === 2} label="Extracting fields"          meta="company · role · location · salary" />
              <AgentStep done={step >= 4} active={step === 3} label={usingAi ? "Generating tags" : "Pattern matching complete"} />
            </div>
          )}

          {/* Preview */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
              Vorschau {ready && <span style={{ color: "var(--accent)", fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>— bearbeitbar</span>}
            </div>

            {/* Logo + name row */}
            {logoUrl && (
              <>
                <img src={logoUrl} alt="" onLoad={() => setLogoOk(true)} onError={() => setLogoOk(false)} style={{ display: "none" }} />
                {logoOk && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <img src={logoUrl} alt={form.company} style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 8, border: "1px solid var(--border)", background: "#fff", padding: 3 }} />
                    <span style={{ fontSize: 11, color: "var(--fg-3)" }}>Logo gefunden ✓</span>
                  </div>
                )}
              </>
            )}

            {/* Fields grid — Notion style */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
              {([
                { key: "company",  label: "Firma *" },
                { key: "role",     label: "Rolle *" },
                { key: "location", label: "Ort" },
                { key: "salary",   label: "Salary" },
              ] as { key: keyof FormState; label: string }[]).map(({ key, label }) => (
                <div key={key} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 1 }}>{label}</div>
                  {ready
                    ? <input className="input-line" value={form[key] as string} onChange={(e) => patch(key, e.target.value)} style={{ fontSize: 13 }} />
                    : phase !== "idle"
                      ? <Skeleton height={22} />
                      : <input className="input-line" placeholder="—" disabled style={{ fontSize: 13 }} />}
                </div>
              ))}
            </div>

            {/* Tags */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Tags</div>
              {ready ? (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                  {form.tags.map((t) => (
                    <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 999, background: "var(--accent-08)", color: "var(--accent)", fontSize: 10, fontWeight: 600, border: "1px solid var(--accent-15)" }}>
                      {t}
                      <button onClick={() => removeTag(t)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, lineHeight: 1, fontSize: 12 }}>×</button>
                    </span>
                  ))}
                  <input value={newTag} onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(newTag); } }}
                    placeholder="+ Tag…"
                    style={{ border: "none", background: "transparent", color: "var(--fg-2)", fontSize: 10, outline: "none", minWidth: 60 }}
                  />
                </div>
              ) : phase !== "idle" ? (
                <div style={{ display: "flex", gap: 5 }}>{[60, 72, 50].map((w, i) => <Skeleton key={i} width={w} height={20} />)}</div>
              ) : <div style={{ height: 20 }} />}
            </div>

            {/* Description with Expand-Logik */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", flex: 1 }}>Beschreibung</span>
                {ready && (
                  <button className="btn btn-ghost btn-icon" style={{ padding: 3 }} onClick={() => setDescExpanded(true)} title="Maximieren">
                    <Maximize2 size={12} />
                  </button>
                )}
              </div>
              {ready
                ? <AutoResizeTextarea value={form.description} onChange={(e) => patch("description", e.target.value)} minRows={3} style={{ fontSize: 12 }} />
                : phase !== "idle"
                  ? <div style={{ display: "flex", flexDirection: "column", gap: 5 }}><Skeleton height={10} /><Skeleton width="90%" height={10} /><Skeleton height={10} /><Skeleton width="55%" height={10} /></div>
                  : <AutoResizeTextarea value="" placeholder="Wird automatisch befüllt…" disabled minRows={3} style={{ fontSize: 12 }} />}
            </div>
          </div>
        </div>

        <div className="drawer-footer">
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" disabled={!canCreate || createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? "Anlegen…" : "Anlegen"}
            <ArrowRight size={13} />
          </button>
        </div>
      </aside>
    </>
  );
}

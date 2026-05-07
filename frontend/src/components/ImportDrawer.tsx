import { useState, useRef, useEffect, useCallback } from "react";
import { X, Link, Sparkles, Check, ArrowRight, Cpu, Cloud, Plus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useUiStore } from "../lib/store";

type ExtractionPhase = "idle" | "reading" | "extracting" | "done";

const STAGES = [
  { id: "import_validating", label: "Inbox" },
  { id: "preparing_cv",      label: "Preparing CV" },
  { id: "preparing_letter",  label: "Preparing Letter" },
  { id: "application_sent",  label: "Submitted" },
  { id: "pending",           label: "Pending" },
];

function Skeleton({ width = "100%", height = 36 }: { width?: string | number; height?: number }) {
  return <div className="skeleton" style={{ width, height, borderRadius: 8 }} />;
}

function AutoResizeTextarea({
  value,
  onChange,
  placeholder,
  minRows = 4,
  disabled = false
}: {
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  minRows?: number;
  disabled?: boolean;
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
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      rows={minRows}
      onInput={resize}
      style={{ resize: "none", overflow: "hidden", minHeight: minRows * 22 + "px" }}
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

type ExtractedRaw = {
  company: string | null;
  role: string | null;
  location: string | null;
  description: string;
  salary?: string | null;
  tags?: string | null;
  source?: string | null;
};

type FormState = {
  company: string;
  role: string;
  location: string;
  salary: string;
  description: string;
  tags: string[];
  source: string;
};

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

type Props = { onClose: () => void };

export function ImportDrawer({ onClose }: Props) {
  const queryClient = useQueryClient();
  const { ai } = useUiStore();
  const [mode, setMode] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [phase, setPhase] = useState<ExtractionPhase>("idle");
  const [step, setStep] = useState(0);
  const [stage, setStage] = useState("import_validating");
  const [newTag, setNewTag] = useState("");

  const [form, setForm] = useState<FormState>({
    company: "", role: "", location: "", salary: "",
    description: "", tags: [], source: ""
  });

  const usingAi = ai.provider !== "none";
  const ready = phase === "done";

  const patch = (field: keyof FormState, value: string | string[]) =>
    setForm((f) => ({ ...f, [field]: value }));

  const extractMutation = useMutation({
    mutationFn: () =>
      api.post<ExtractedRaw>("/api/applications/import", {
        url: mode === "url" ? url : undefined,
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
        stage
      }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      onClose();
    }
  });

  const runExtraction = async () => {
    setPhase("reading");
    setStep(0);
    setForm({ company: "", role: "", location: "", salary: "", description: "", tags: [], source: "" });

    const advance = (n: number, p: ExtractionPhase) =>
      setTimeout(() => { setStep(n); setPhase(p); }, n * 600);
    advance(1, "reading");
    advance(2, "extracting");
    advance(3, "extracting");

    try {
      const result = await extractMutation.mutateAsync();
      setTimeout(() => {
        setStep(4);
        setPhase("done");
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
    } catch {
      setPhase("idle");
    }
  };

  const addTag = (t: string) => {
    const tag = t.trim();
    if (tag && !form.tags.includes(tag)) patch("tags", [...form.tags, tag]);
    setNewTag("");
  };
  const removeTag = (t: string) => patch("tags", form.tags.filter((x) => x !== t));

  const canCreate = ready && (form.company || form.role);

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer" style={{ width: 560 }}>
        <div className="drawer-head">
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ color: "var(--accent)" }}>Import</div>
            <h2 style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--fg-1)" }}>
              Add new application
            </h2>
            <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 2 }}>
              Paste a job URL or description — wir extrahieren die Felder.
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="drawer-body">
          {/* Mode + provider badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="mode-toggle">
              <button className={mode === "url" ? "active" : ""} onClick={() => setMode("url")}>URL</button>
              <button className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}>Paste text</button>
            </div>
            <div style={{ flex: 1 }} />
            {usingAi ? (
              <span style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 999,
                background: ai.provider === "lm-studio" ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
                color: ai.provider === "lm-studio" ? "var(--green)" : "#f59e0b",
                fontSize: 10.5, fontWeight: 700, border: "1px solid",
                borderColor: ai.provider === "lm-studio" ? "rgba(16,185,129,0.30)" : "rgba(245,158,11,0.30)"
              }}>
                {ai.provider === "lm-studio" ? <Cpu size={11} /> : <Cloud size={11} />}
                {ai.provider === "lm-studio"
                  ? `LM Studio${ai.lmStudioModel ? ` · ${ai.lmStudioModel.split("/").pop()}` : ""}`
                  : "Anthropic · claude-haiku"}
              </span>
            ) : (
              <span style={{ padding: "4px 10px", borderRadius: 999, background: "var(--surface-2)", color: "var(--fg-3)", fontSize: 10.5, fontWeight: 600, border: "1px solid var(--border)" }}>
                Regex fallback
              </span>
            )}
          </div>

          {mode === "url" ? (
            <div className="field">
              <label>Job URL</label>
              <div style={{ position: "relative" }}>
                <Link size={13} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--fg-3)", pointerEvents: "none" }} />
                <input value={url} onChange={(e) => setUrl(e.target.value)} style={{ paddingLeft: 34 }} placeholder="https://…" />
              </div>
            </div>
          ) : (
            <div className="field">
              <label>Stellenbeschreibung</label>
              <AutoResizeTextarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste the full job description here…"
                minRows={5}
              />
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ alignSelf: "flex-start" }}
            onClick={runExtraction}
            disabled={phase === "reading" || phase === "extracting" || (!url && !pasteText)}
          >
            <Sparkles size={13} />
            {phase === "idle" ? (usingAi ? "Extract with AI" : "Extract (regex)") : phase === "done" ? "Re-extract" : "Extracting…"}
          </button>

          {/* Live timeline */}
          {phase !== "idle" && (
            <div className="card" style={{ background: "var(--surface-2)", padding: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                {usingAi ? `${ai.provider === "lm-studio" ? "LM Studio" : "Anthropic"} · Live` : "Regex · Live"}
              </div>
              <AgentStep done={step >= 1} active={step === 0} label="Fetching page" meta={url || "text input"} />
              <AgentStep done={step >= 2} active={step === 1} label="Reading job description" meta="analyzing content" />
              <AgentStep done={step >= 3} active={step === 2} label="Extracting structured fields" meta="company · role · location · salary" />
              <AgentStep done={step >= 4} active={step === 3} label={usingAi ? "Generating tags" : "Pattern matching complete"} />
            </div>
          )}

          {/* Editable preview — controlled inputs so user corrections are captured */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Preview <span style={{ color: "var(--fg-3)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>{ready ? "— bearbeitbar vor dem Speichern" : ""}</span></div>
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {(["company", "role", "location", "salary"] as const).map((field) => (
                  <div className="field" key={field}>
                    <label>{field === "company" ? "Firma *" : field === "role" ? "Rolle *" : field === "location" ? "Ort" : "Salary"}</label>
                    {ready
                      ? <input value={form[field]} onChange={(e) => patch(field, e.target.value)} />
                      : phase !== "idle"
                        ? <Skeleton height={36} />
                        : <input placeholder="—" disabled />}
                  </div>
                ))}
              </div>

              {/* Tags */}
              <div className="field">
                <label>Tags {ready && form.tags.length > 0 && <span style={{ color: "var(--accent)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>AI-generated</span>}</label>
                {ready ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {form.tags.map((t) => (
                      <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 999, background: "var(--accent-08)", color: "var(--accent)", fontSize: 11, fontWeight: 600, border: "1px solid var(--accent-15)" }}>
                        {t}
                        <button onClick={() => removeTag(t)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, display: "flex", lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                    <input
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(newTag); } }}
                      placeholder="+ Tag hinzufügen…"
                      style={{ border: "none", background: "transparent", color: "var(--fg-2)", fontSize: 11, outline: "none", minWidth: 100 }}
                    />
                  </div>
                ) : phase !== "idle" ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    {[70, 80, 60].map((w, i) => <Skeleton key={i} width={w} height={24} />)}
                  </div>
                ) : (
                  <div style={{ height: 24 }} />
                )}
              </div>

              <div className="field">
                <label>Beschreibung</label>
                {ready
                  ? <AutoResizeTextarea value={form.description} onChange={(e) => patch("description", e.target.value)} minRows={3} />
                  : phase !== "idle"
                    ? <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><Skeleton height={11} /><Skeleton width="92%" height={11} /><Skeleton height={11} /><Skeleton width="60%" height={11} /></div>
                    : <AutoResizeTextarea value="" placeholder="Will be filled automatically" disabled minRows={3} />}
              </div>
            </div>
          </div>

          <div className="field">
            <label>Initial Stage</label>
            <select value={stage} onChange={(e) => setStage(e.target.value)}>
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div className="drawer-footer">
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button
            className="btn btn-primary"
            disabled={!canCreate || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "Anlegen…" : "Anlegen"}
            <ArrowRight size={13} />
          </button>
        </div>
      </aside>
    </>
  );
}

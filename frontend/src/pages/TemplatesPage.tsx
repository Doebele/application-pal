import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  OpenNewWindow, Trash, Plus, RefreshCircle, Check, Calendar,
} from "iconoir-react";
import { Topbar } from "../components/Topbar";
import { api } from "../lib/api";

// ─── Types ────────────────────────────────────────────────────
interface DriveTemplate {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
}

interface TemplateEntry {
  id: string;
  name: string;
  description?: string;
}

interface DocTemplateConfig {
  [type: string]: {
    activeId: string | null;
    templates: TemplateEntry[];
  };
}

// ─── Content type definitions ─────────────────────────────────
const CONTENT_TYPES = [
  {
    id: "interview-prep",
    label: "Interview-Vorbereitung",
    icon: "🎯",
    description: "Fragen, STAR-Beispiele, Chris-Voss-Fragen, Rückfragen",
    placeholders: ["{{FIRMA}}", "{{ROLLE}}", "{{DATUM}}", "{{NAME}}", "{{FRAGEN}}", "{{STAR}}", "{{VOSS_FRAGEN}}", "{{RUECKFRAGEN}}"],
  },
  {
    id: "cv",
    label: "Lebenslauf / CV",
    icon: "📄",
    description: "Master-CV mit KI-generierten Highlights für die Stelle",
    placeholders: ["{{NAME}}", "{{HEADLINE}}", "{{EMAIL}}", "{{ORT}}", "{{FIRMA}}", "{{ROLLE}}", "{{HIGHLIGHTS}}", "{{LEBENSLAUF}}"],
  },
  {
    id: "cover-letter",
    label: "Anschreiben",
    icon: "✉️",
    description: "Motivationsschreiben",
    placeholders: ["{{FIRMA}}", "{{ROLLE}}", "{{DATUM}}", "{{NAME}}", "{{ORT}}", "{{BETREFF}}", "{{ANSCHREIBEN}}"],
  },
  {
    id: "salary-check",
    label: "Gehalts-Check",
    icon: "💰",
    description: "Lohnband-Analyse mit Verhandlungstaktiken",
    placeholders: ["{{FIRMA}}", "{{ROLLE}}", "{{DATUM}}", "{{LOHNBAND}}", "{{TAKTIKEN}}", "{{FORMULIERUNGEN}}", "{{VOSS_ANKER}}"],
  },
  {
    id: "company-research",
    label: "Unternehmensrecherche",
    icon: "🔍",
    description: "Unternehmensüberblick, Kultur, Wettbewerber, Trends",
    placeholders: ["{{FIRMA}}", "{{ROLLE}}", "{{DATUM}}", "{{UNTERNEHMENSUEBERBLICK}}", "{{BRANCHE}}", "{{KULTUR}}", "{{WETTBEWERBER}}", "{{AKTUELLE_THEMEN}}"],
  },
  {
    id: "ackermann-script",
    label: "Gehaltsverhandlung",
    icon: "🤝",
    description: "Ackermann-Script mit Schritten und Voss-Ankern",
    placeholders: ["{{FIRMA}}", "{{ROLLE}}", "{{DATUM}}", "{{ZIELGEHALT_ANKER}}", "{{SCHRITTE}}", "{{NICHTMONETAER}}", "{{VOSS_ANKER}}"],
  },
  {
    id: "onboarding",
    label: "Onboarding-Checkliste",
    icon: "✅",
    description: "30/60/90-Tage-Plan für den neuen Job",
    placeholders: ["{{FIRMA}}", "{{ROLLE}}", "{{DATUM}}", "{{ERSTE_30_TAGE}}", "{{ERSTE_60_TAGE}}", "{{ERSTE_90_TAGE}}", "{{ALLGEMEIN}}"],
  },
] as const;

type ContentTypeId = (typeof CONTENT_TYPES)[number]["id"];

// ─── Hook: load + save docTemplates from profile ──────────────
function useDocTemplates() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.get<{ docTemplates?: string | null }>("/api/profile").then(r => r.data),
  });

  const config: DocTemplateConfig = (() => {
    if (!profile?.docTemplates) return {};
    try { return JSON.parse(profile.docTemplates) as DocTemplateConfig; }
    catch { return {}; }
  })();

  const save = useCallback(async (next: DocTemplateConfig) => {
    await api.patch("/api/profile", { docTemplates: JSON.stringify(next) });
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  }, [queryClient]);

  const setActive = useCallback(async (type: string, id: string | null) => {
    const next = { ...config };
    if (!next[type]) next[type] = { activeId: null, templates: [] };
    next[type] = { ...next[type], activeId: id };
    await save(next);
  }, [config, save]);

  const addTemplate = useCallback(async (type: string, entry: TemplateEntry) => {
    const next = { ...config };
    if (!next[type]) next[type] = { activeId: null, templates: [] };
    if (!next[type].templates.find(t => t.id === entry.id)) {
      next[type] = { ...next[type], templates: [...next[type].templates, entry] };
    }
    if (!next[type].activeId) next[type].activeId = entry.id;
    await save(next);
  }, [config, save]);

  const removeTemplate = useCallback(async (type: string, id: string) => {
    const next = { ...config };
    if (!next[type]) return;
    const filtered = next[type].templates.filter(t => t.id !== id);
    const activeId = next[type].activeId === id
      ? (filtered[0]?.id ?? null)
      : next[type].activeId;
    next[type] = { activeId, templates: filtered };
    await save(next);
  }, [config, save]);

  return { config, isLoading, setActive, addTemplate, removeTemplate };
}

// ─── Drive template picker modal ──────────────────────────────
function DrivePickerModal({
  type, onAdd, onClose,
}: {
  type: ContentTypeId;
  onAdd: (entry: TemplateEntry) => void;
  onClose: () => void;
}) {
  const { data: driveTemplates = [], isLoading } = useQuery<DriveTemplate[]>({
    queryKey: ["drive-templates"],
    queryFn: () => api.get<DriveTemplate[]>("/api/drive/templates").then(r => r.data),
  });

  const ct = CONTENT_TYPES.find(c => c.id === type);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14,
        padding: "20px 24px", width: 480, maxHeight: "70vh", overflow: "auto",
        boxShadow: "var(--shadow-modal)",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg-1)", marginBottom: 4 }}>
          Vorlage aus Google Drive hinzufügen
        </div>
        <div style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 16 }}>
          {ct?.label} — Wähle ein Google Doc aus deinem Drive-Master-Ordner
        </div>
        {isLoading ? (
          <div style={{ fontSize: 12, color: "var(--fg-3)", display: "flex", alignItems: "center", gap: 6 }}>
            <RefreshCircle width={12} height={12} style={{ animation: "spin 1s linear infinite" }} />
            Lade Vorlagen aus Drive…
          </div>
        ) : driveTemplates.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--fg-3)" }}>
            Keine Google Docs im Master-Ordner gefunden. Erstelle zuerst eine Vorlage via „+ Neu erstellen".
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {driveTemplates.map(t => (
              <button key={t.id}
                onClick={() => { onAdd({ id: t.id, name: t.name }); onClose(); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", borderRadius: 8,
                  border: "1px solid var(--border)", background: "var(--surface-2)",
                  cursor: "pointer", fontFamily: "var(--font-sans)", textAlign: "left",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-08)")}
                onMouseLeave={e => (e.currentTarget.style.background = "var(--surface-2)")}
              >
                <Calendar width={14} height={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.name}
                  </div>
                </div>
                {t.webViewLink && (
                  <a href={t.webViewLink} target="_blank" rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{ color: "var(--fg-3)", display: "flex", flexShrink: 0 }}>
                    <OpenNewWindow width={12} height={12} />
                  </a>
                )}
              </button>
            ))}
          </div>
        )}
        <button onClick={onClose}
          className="btn btn-secondary" style={{ fontSize: 12, marginTop: 16, width: "100%" }}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}

// ─── Single content-type section ─────────────────────────────
function ContentTypeSection({
  contentType,
  config,
  onSetActive,
  onAddFromDrive,
  onRemove,
  onCreateNew,
}: {
  contentType: (typeof CONTENT_TYPES)[number];
  config: DocTemplateConfig;
  onSetActive: (type: string, id: string | null) => Promise<void>;
  onAddFromDrive: (type: ContentTypeId) => void;
  onRemove: (type: string, id: string) => Promise<void>;
  onCreateNew: (type: ContentTypeId) => Promise<void>;
}) {
  const [showPlaceholders, setShowPlaceholders] = useState(false);
  const [creating, setCreating] = useState(false);
  const typeConfig = config[contentType.id];
  const templates = typeConfig?.templates ?? [];
  const activeId = typeConfig?.activeId ?? null;

  const handleCreateNew = async () => {
    setCreating(true);
    try { await onCreateNew(contentType.id as ContentTypeId); }
    finally { setCreating(false); }
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>{contentType.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fg-1)" }}>{contentType.label}</div>
          <div style={{ fontSize: 11, color: "var(--fg-3)" }}>{contentType.description}</div>
        </div>
        <button
          onClick={() => onAddFromDrive(contentType.id as ContentTypeId)}
          className="btn btn-ghost"
          style={{ fontSize: 11, gap: 4 }}
        >
          <Plus width={11} height={11} /> Aus Drive
        </button>
        <button
          onClick={handleCreateNew}
          className="btn btn-secondary"
          style={{ fontSize: 11, gap: 4 }}
          disabled={creating}
        >
          {creating
            ? <><RefreshCircle width={11} height={11} style={{ animation: "spin 1s linear infinite" }} /> Erstelle…</>
            : <><Plus width={11} height={11} /> Neu erstellen</>
          }
        </button>
      </div>

      {templates.length === 0 ? (
        <div style={{
          padding: "14px 16px", borderRadius: 8,
          border: "1px dashed var(--border)", background: "var(--surface-2)",
          fontSize: 12, color: "var(--fg-3)", textAlign: "center",
        }}>
          Noch keine Vorlage — „Neu erstellen" generiert eine formatierte Google Doc Vorlage mit Platzhaltern.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {templates.map(tmpl => {
            const isActive = tmpl.id === activeId;
            return (
              <div
                key={tmpl.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                  border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                  background: isActive ? "var(--accent-08)" : "var(--surface-2)",
                  transition: "all 0.12s ease",
                }}
                onClick={() => onSetActive(contentType.id, isActive ? null : tmpl.id)}
              >
                <div style={{
                  width: 16, height: 16, borderRadius: "50%",
                  border: `2px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                  background: isActive ? "var(--accent)" : "transparent",
                  flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.12s",
                }}>
                  {isActive && <Check width={9} height={9} style={{ color: "#fff" }} />}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tmpl.name}
                  </div>
                  {tmpl.description && (
                    <div style={{ fontSize: 10, color: "var(--fg-3)" }}>{tmpl.description}</div>
                  )}
                  {isActive && (
                    <div style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600, marginTop: 1 }}>
                      Aktiv — wird beim Export verwendet
                    </div>
                  )}
                </div>

                <a
                  href={`https://docs.google.com/document/d/${tmpl.id}/edit`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ color: "var(--fg-3)", display: "flex", flexShrink: 0, padding: 4 }}
                  title="In Google Docs öffnen"
                >
                  <OpenNewWindow width={13} height={13} />
                </a>

                <button
                  onClick={e => { e.stopPropagation(); void onRemove(contentType.id, tmpl.id); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", padding: 4, display: "flex", flexShrink: 0 }}
                  title="Aus Liste entfernen (bleibt in Drive)"
                >
                  <Trash width={13} height={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => setShowPlaceholders(v => !v)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 10, color: "var(--fg-3)", marginTop: 8, padding: 0,
          fontFamily: "var(--font-sans)",
        }}
      >
        {showPlaceholders ? "▲" : "▼"} Verfügbare Platzhalter für diese Vorlage
      </button>
      {showPlaceholders && (
        <div style={{
          marginTop: 6, padding: "8px 12px", borderRadius: 6,
          background: "var(--surface-2)", border: "1px solid var(--border)",
          display: "flex", flexWrap: "wrap", gap: 4,
        }}>
          {contentType.placeholders.map(p => (
            <code key={p} style={{
              fontSize: 10, background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 4, padding: "1px 6px", color: "var(--accent)",
              fontFamily: "var(--font-mono)",
            }}>
              {p}
            </code>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main TemplatesPage ───────────────────────────────────────
export function TemplatesPage() {
  const { config, isLoading, setActive, addTemplate, removeTemplate } = useDocTemplates();
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState<ContentTypeId | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ connected: boolean }>("/api/google/status")
      .then(r => setGoogleConnected(r.data.connected))
      .catch(() => {});
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleCreateNew = async (type: ContentTypeId) => {
    try {
      const r = await api.post<{ fileId: string; fileName: string; fileUrl: string }>(
        "/api/drive/templates/create", { type }
      );
      await addTemplate(type, { id: r.data.fileId, name: r.data.fileName });
      queryClient.invalidateQueries({ queryKey: ["drive-templates"] });
      showToast(`Vorlage „${r.data.fileName}" erstellt und aktiviert`);
    } catch {
      showToast("Fehler beim Erstellen — Google Drive verbunden?");
    }
  };

  return (
    <>
      <Topbar
        title="Vorlagen"
        sub="Google Doc Vorlagen für KI-Exporte — Stil aus Drive, Inhalt aus KI"
      />

      <div className="page-content" style={{ maxWidth: 720 }}>
        {!isLoading && !googleConnected && (
          <div style={{
            padding: "12px 16px", borderRadius: 10, marginBottom: 24,
            background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)",
            fontSize: 12, color: "#fbbf24",
          }}>
            Google Drive ist nicht verbunden.{" "}
            <a href="/settings" style={{ color: "inherit", fontWeight: 700 }}>
              Settings → Integrationen → Google verbinden
            </a>
          </div>
        )}

        <div style={{
          padding: "12px 16px", borderRadius: 10, marginBottom: 28,
          background: "var(--surface-2)", border: "1px solid var(--border)",
          fontSize: 12, color: "var(--fg-2)", lineHeight: 1.7,
        }}>
          <strong style={{ color: "var(--fg-1)" }}>So funktioniert es:</strong>{" "}
          Klicke „Neu erstellen" — die App legt ein Google Doc mit Überschriften und Platzhaltern wie{" "}
          <code style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--surface)", borderRadius: 3, padding: "1px 4px", color: "var(--accent)" }}>{"{{FIRMA}}"}</code>{" "}
          an. Passe das Doc in Google Docs nach Belieben an (Schriften, Farben, Logo). Beim nächsten „Als Google Doc" Export
          wird die Vorlage kopiert und die Platzhalter durch den KI-Inhalt ersetzt — dein Styling bleibt erhalten.
        </div>

        {isLoading ? (
          <div style={{ fontSize: 13, color: "var(--fg-3)", display: "flex", alignItems: "center", gap: 8 }}>
            <RefreshCircle width={13} height={13} style={{ animation: "spin 1s linear infinite" }} />
            Lade Konfiguration…
          </div>
        ) : (
          CONTENT_TYPES.map(ct => (
            <ContentTypeSection
              key={ct.id}
              contentType={ct}
              config={config}
              onSetActive={setActive}
              onAddFromDrive={(type) => setPickerOpen(type)}
              onRemove={removeTemplate}
              onCreateNew={handleCreateNew}
            />
          ))
        )}
      </div>

      {pickerOpen && (
        <DrivePickerModal
          type={pickerOpen}
          onAdd={(entry) => void addTemplate(pickerOpen, entry)}
          onClose={() => setPickerOpen(null)}
        />
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "8px 16px", fontSize: 12,
          color: "var(--fg-1)", boxShadow: "var(--shadow-modal)", zIndex: 9999,
          whiteSpace: "nowrap",
        }}>
          {toast}
        </div>
      )}
    </>
  );
}

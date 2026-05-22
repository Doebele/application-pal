import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  OpenNewWindow, Trash, Plus, RefreshCircle, Check, Calendar,
  ChatBubbleCheck, PageEdit, SendMail, Coins, Search, HandCash, TaskList,
} from "iconoir-react";
// @ts-ignore — round-flag-icons ships plain SVG files, no TS types needed
import deFlagUrl from "round-flag-icons/flags/de.svg?url";
// @ts-ignore
import gbFlagUrl from "round-flag-icons/flags/gb.svg?url";
import { Topbar } from "../components/Topbar";
import { api } from "../lib/api";

// ─── Round flag icon (round-flag-icons library) ───────────────
function FlagIcon({ lang, size = 20 }: { lang: "de" | "en"; size?: number }) {
  return (
    <img
      src={lang === "de" ? deFlagUrl as string : gbFlagUrl as string}
      width={size} height={size}
      alt={lang === "de" ? "Deutsch" : "English"}
      style={{ borderRadius: "50%", display: "block", flexShrink: 0, objectFit: "cover" }}
    />
  );
}

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
  language?: "de" | "en"; // tag for language — unset = universal
}

interface DocTemplateTypeConfig {
  activeId: string | null;    // legacy / universal fallback
  activeIdDe?: string | null; // active template for DE applications
  activeIdEn?: string | null; // active template for EN applications
  templates: TemplateEntry[];
}

interface DocTemplateConfig {
  [type: string]: DocTemplateTypeConfig;
}

type Lang = "de" | "en";

// ─── Content type definitions ─────────────────────────────────
// Icons: all from Iconoir (monochrome), rendered at 28×28
const CONTENT_TYPES = [
  {
    id: "interview-prep",
    label: "Interview-Vorbereitung",
    Icon: ChatBubbleCheck,
    description: "Fragen, STAR-Beispiele, Chris-Voss-Fragen, Rückfragen",
    placeholders: ["{{FIRMA}}", "{{ROLLE}}", "{{DATUM}}", "{{NAME}}", "{{FRAGEN}}", "{{STAR}}", "{{VOSS_FRAGEN}}", "{{RUECKFRAGEN}}"],
  },
  {
    id: "cv",
    label: "Lebenslauf / CV",
    Icon: PageEdit,
    description: "Master-CV mit KI-generierten Highlights für die Stelle",
    placeholders: ["{{NAME}}", "{{HEADLINE}}", "{{EMAIL}}", "{{ORT}}", "{{FIRMA}}", "{{ROLLE}}", "{{HIGHLIGHTS}}", "{{LEBENSLAUF}}"],
  },
  {
    id: "cover-letter",
    label: "Anschreiben",
    Icon: SendMail,
    description: "Motivationsschreiben",
    placeholders: ["{{FIRMA}}", "{{ROLLE}}", "{{DATUM}}", "{{NAME}}", "{{ORT}}", "{{BETREFF}}", "{{ANSCHREIBEN}}"],
  },
  {
    id: "salary-check",
    label: "Gehalts-Check",
    Icon: Coins,
    description: "Lohnband-Analyse mit Verhandlungstaktiken",
    placeholders: ["{{FIRMA}}", "{{ROLLE}}", "{{DATUM}}", "{{LOHNBAND}}", "{{TAKTIKEN}}", "{{FORMULIERUNGEN}}", "{{VOSS_ANKER}}"],
  },
  {
    id: "company-research",
    label: "Unternehmensrecherche",
    Icon: Search,
    description: "Unternehmensüberblick, Kultur, Wettbewerber, Trends",
    placeholders: ["{{FIRMA}}", "{{ROLLE}}", "{{DATUM}}", "{{UNTERNEHMENSUEBERBLICK}}", "{{BRANCHE}}", "{{KULTUR}}", "{{WETTBEWERBER}}", "{{AKTUELLE_THEMEN}}"],
  },
  {
    id: "ackermann-script",
    label: "Gehaltsverhandlung",
    Icon: HandCash,
    description: "Ackermann-Script mit Schritten und Voss-Ankern",
    placeholders: ["{{FIRMA}}", "{{ROLLE}}", "{{DATUM}}", "{{ZIELGEHALT_ANKER}}", "{{SCHRITTE}}", "{{NICHTMONETAER}}", "{{VOSS_ANKER}}"],
  },
  {
    id: "onboarding",
    label: "Onboarding-Checkliste",
    Icon: TaskList,
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

  /** Set the active template for a given language (or universal if no lang) */
  const setActive = useCallback(async (type: string, id: string | null, lang?: Lang) => {
    const next = { ...config };
    if (!next[type]) next[type] = { activeId: null, templates: [] };
    const upd = { ...next[type] };
    if (!lang || lang === "de") { upd.activeIdDe = id; if (!lang) upd.activeId = id; }
    if (!lang || lang === "en") { upd.activeIdEn = id; if (!lang) upd.activeId = id; }
    next[type] = upd;
    await save(next);
  }, [config, save]);

  /** Add a template entry (with optional language tag) */
  const addTemplate = useCallback(async (type: string, entry: TemplateEntry) => {
    const next = { ...config };
    if (!next[type]) next[type] = { activeId: null, templates: [] };
    if (!next[type].templates.find(t => t.id === entry.id)) {
      next[type] = { ...next[type], templates: [...next[type].templates, entry] };
    }
    // Auto-activate if no active for this language yet
    const upd = { ...next[type] };
    if (entry.language === "de" && !upd.activeIdDe)  upd.activeIdDe = entry.id;
    if (entry.language === "en" && !upd.activeIdEn)  upd.activeIdEn = entry.id;
    if (!entry.language && !upd.activeId)             upd.activeId   = entry.id;
    next[type] = upd;
    await save(next);
  }, [config, save]);

  const removeTemplate = useCallback(async (type: string, id: string) => {
    const next = { ...config };
    if (!next[type]) return;
    const filtered = next[type].templates.filter(t => t.id !== id);
    const upd: DocTemplateTypeConfig = {
      ...next[type],
      templates: filtered,
      activeId:   next[type].activeId   === id ? (filtered[0]?.id ?? null) : next[type].activeId,
      activeIdDe: next[type].activeIdDe === id ? (filtered.find(t => t.language === "de")?.id ?? filtered[0]?.id ?? null) : next[type].activeIdDe,
      activeIdEn: next[type].activeIdEn === id ? (filtered.find(t => t.language === "en")?.id ?? filtered[0]?.id ?? null) : next[type].activeIdEn,
    };
    next[type] = upd;
    await save(next);
  }, [config, save]);

  return { config, isLoading, setActive, addTemplate, removeTemplate };
}

// ─── Drive template picker modal ──────────────────────────────
function DrivePickerModal({
  type, lang, onAdd, onClose,
}: {
  type: ContentTypeId;
  lang: Lang;
  onAdd: (entry: TemplateEntry) => void;
  onClose: () => void;
}) {
  const { data: driveTemplates = [], isLoading } = useQuery<DriveTemplate[]>({
    queryKey: ["drive-templates"],
    queryFn: () => api.get<DriveTemplate[]>("/api/drive/templates").then(r => r.data),
  });

  const ct = CONTENT_TYPES.find(c => c.id === type);
  const langLabel = lang === "de" ? "Deutsch" : "English";

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
          <FlagIcon lang={lang} size={18} /> {langLabel} — Vorlage aus Drive hinzufügen
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
                onClick={() => { onAdd({ id: t.id, name: t.name, language: lang }); onClose(); }}
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

// ─── Language sub-section (DE or EN) within a content type ────
function LangSection({
  lang,
  templates,
  activeId,
  onSetActive,
  onRemove,
  onAddFromDrive,
  onCreateNew,
}: {
  lang: Lang;
  templates: TemplateEntry[];
  activeId: string | null;
  onSetActive: (id: string | null) => void;
  onRemove: (id: string) => void;
  onAddFromDrive: () => void;
  onCreateNew: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const label  = lang === "de" ? "Deutsch" : "English";

  const handleCreate = async () => {
    setCreating(true);
    try { await onCreateNew(); }
    finally { setCreating(false); }
  };

  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 10,
      marginBottom: 8, overflow: "hidden",
    }}>
      {/* Language header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px",
        background: "var(--surface-2)",
        borderBottom: templates.length > 0 ? "1px solid var(--border)" : undefined,
      }}>
        <FlagIcon lang={lang} size={20} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-2)", flex: 1 }}>{label}</span>
        <button
          onClick={onAddFromDrive}
          className="btn btn-ghost"
          style={{ fontSize: 10, gap: 3, padding: "3px 8px" }}
        >
          <Plus width={10} height={10} /> Aus Drive
        </button>
        <button
          onClick={handleCreate}
          className="btn btn-secondary"
          style={{ fontSize: 10, gap: 3, padding: "3px 8px" }}
          disabled={creating}
        >
          {creating
            ? <><RefreshCircle width={10} height={10} style={{ animation: "spin 1s linear infinite" }} /> Erstelle…</>
            : <><Plus width={10} height={10} /> Neu erstellen</>
          }
        </button>
      </div>

      {/* Template list */}
      {templates.length === 0 ? (
        <div style={{
          padding: "10px 14px", fontSize: 11, color: "var(--fg-4)", fontStyle: "italic",
        }}>
          Noch keine {label} Vorlage — „Neu erstellen" legt eine formatierte Vorlage mit Platzhaltern an.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {templates.map((tmpl, i) => {
            const isActive = tmpl.id === activeId;
            return (
              <div
                key={tmpl.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", cursor: "pointer",
                  borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                  background: isActive ? "var(--accent-08)" : "transparent",
                  transition: "background 0.1s",
                }}
                onClick={() => onSetActive(isActive ? null : tmpl.id)}
              >
                <div style={{
                  width: 15, height: 15, borderRadius: "50%", flexShrink: 0,
                  border: `2px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                  background: isActive ? "var(--accent)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.12s",
                }}>
                  {isActive && <Check width={8} height={8} style={{ color: "#fff" }} />}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tmpl.name}
                  </div>
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
                  <OpenNewWindow width={12} height={12} />
                </a>

                <button
                  onClick={e => { e.stopPropagation(); onRemove(tmpl.id); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", padding: 4, display: "flex", flexShrink: 0 }}
                  title="Aus Liste entfernen (bleibt in Drive)"
                >
                  <Trash width={12} height={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
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
  onSetActive: (type: string, id: string | null, lang: Lang) => Promise<void>;
  onAddFromDrive: (type: ContentTypeId, lang: Lang) => void;
  onRemove: (type: string, id: string) => Promise<void>;
  onCreateNew: (type: ContentTypeId, lang: Lang) => Promise<void>;
}) {
  const [showPlaceholders, setShowPlaceholders] = useState(false);
  const typeConfig = config[contentType.id];
  const allTemplates = typeConfig?.templates ?? [];

  const deTemplates = allTemplates.filter(t => !t.language || t.language === "de");
  const enTemplates = allTemplates.filter(t => !t.language || t.language === "en");

  const activeIdDe = typeConfig?.activeIdDe ?? typeConfig?.activeId ?? null;
  const activeIdEn = typeConfig?.activeIdEn ?? typeConfig?.activeId ?? null;

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Type header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <contentType.Icon width={28} height={28} style={{ color: "var(--fg-2)", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fg-1)" }}>{contentType.label}</div>
          <div style={{ fontSize: 11, color: "var(--fg-3)" }}>{contentType.description}</div>
        </div>
      </div>

      {/* DE section */}
      <LangSection
        lang="de"
        templates={deTemplates}
        activeId={activeIdDe}
        onSetActive={id => void onSetActive(contentType.id, id, "de")}
        onRemove={id => void onRemove(contentType.id, id)}
        onAddFromDrive={() => onAddFromDrive(contentType.id as ContentTypeId, "de")}
        onCreateNew={() => onCreateNew(contentType.id as ContentTypeId, "de")}
      />

      {/* EN section */}
      <LangSection
        lang="en"
        templates={enTemplates}
        activeId={activeIdEn}
        onSetActive={id => void onSetActive(contentType.id, id, "en")}
        onRemove={id => void onRemove(contentType.id, id)}
        onAddFromDrive={() => onAddFromDrive(contentType.id as ContentTypeId, "en")}
        onCreateNew={() => onCreateNew(contentType.id as ContentTypeId, "en")}
      />

      {/* Placeholders */}
      <button
        onClick={() => setShowPlaceholders(v => !v)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 10, color: "var(--fg-3)", marginTop: 2, padding: 0,
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
  const [pickerOpen, setPickerOpen] = useState<{ type: ContentTypeId; lang: Lang } | null>(null);
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

  const handleCreateNew = async (type: ContentTypeId, lang: Lang) => {
    try {
      const r = await api.post<{ fileId: string; fileName: string; fileUrl: string }>(
        "/api/drive/templates/create", { type, language: lang }
      );
      await addTemplate(type, { id: r.data.fileId, name: r.data.fileName, language: lang });
      queryClient.invalidateQueries({ queryKey: ["drive-templates"] });
      showToast(`Vorlage „${r.data.fileName}" erstellt`);
    } catch {
      showToast("Fehler beim Erstellen — Google Drive verbunden?");
    }
  };

  return (
    <>
      <Topbar
        title="Vorlagen"
        sub="Google Doc Vorlagen für KI-Exporte — je Sprache getrennt auswählbar"
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
          Für jede Vorlage gibt es eine <strong style={{ color: "var(--fg-1)", display: "inline-flex", alignItems: "center", gap: 4, verticalAlign: "middle" }}><FlagIcon lang="de" size={15} /> Deutsch</strong>{" "}
          und eine <strong style={{ color: "var(--fg-1)", display: "inline-flex", alignItems: "center", gap: 4, verticalAlign: "middle" }}><FlagIcon lang="en" size={15} /> English</strong> Version.
          „Neu erstellen" legt ein formatiertes Google Doc mit Platzhaltern wie{" "}
          <code style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--surface)", borderRadius: 3, padding: "1px 4px", color: "var(--accent)" }}>{"{{FIRMA}}"}</code>{" "}
          an. Beim Export wählt die App automatisch die Vorlage passend zur Bewerbungssprache.
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
              onAddFromDrive={(type, lang) => setPickerOpen({ type, lang })}
              onRemove={removeTemplate}
              onCreateNew={handleCreateNew}
            />
          ))
        )}
      </div>

      {pickerOpen && (
        <DrivePickerModal
          type={pickerOpen.type}
          lang={pickerOpen.lang}
          onAdd={(entry) => void addTemplate(pickerOpen.type, entry)}
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

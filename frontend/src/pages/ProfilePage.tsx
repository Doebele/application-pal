import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import imgSchulabgaenger   from "../assets/personas/schulabgaenger.png";
import imgBerufseinsteiger from "../assets/personas/berufseinsteiger.png";
import imgBerufsumsteiger  from "../assets/personas/berufsumsteiger.png";
import { OpenNewWindow, FloppyDisk, User, Linkedin, Page, RefreshCircle, Expand, Collapse, LightBulb } from "iconoir-react";
import { Topbar } from "../components/Topbar";
import { api } from "../lib/api";
import type { UserProfile } from "@application-pal/shared";

function AutoResizeTextarea({ value, onChange, onBlur, placeholder, minRows = 4 }: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      rows={minRows}
      style={{ resize: "none", overflow: "hidden", background: "transparent", color: "var(--fg-1)", fontFamily: "var(--font-sans)", fontSize: 13, outline: "none" }}
    />
  );
}

// Notion-style underline — use className="input-line" instead of inline styles

export function ProfilePage() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Partial<UserProfile>>({
    name: "", email: "", phone: "", location: "", headline: "",
    linkedinUrl: "", linkedinBio: "", photoUrl: "", masterCv: "", personalNotes: "", desiredSalary: ""
  });
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [linkedinExpanded, setLinkedinExpanded] = useState(false);
  const [cvExpanded, setCvExpanded] = useState(false);
  // Vorschau / Bearbeiten modes
  const [cvMode, setCvMode]       = useState<"preview" | "edit">("preview");
  const [notesMode, setNotesMode] = useState<"preview" | "edit">("preview");

  useEffect(() => {
    api.get<UserProfile>("/api/profile")
      .then((r) => setProfile(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async (patch?: Partial<UserProfile>) => {
    setSaving(true);
    try {
      const data = patch ? { ...profile, ...patch } : profile;
      await api.put("/api/profile", data);
      if (patch) setProfile((p) => ({ ...p, ...patch }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [profile]);

  const field = (key: keyof UserProfile) => ({
    className: "input-line",
    value: (profile[key] as string) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setProfile((p) => ({ ...p, [key]: e.target.value })),
    onBlur: () => save({ [key]: profile[key] } as Partial<UserProfile>)
  });

  if (loading) return (
    <>
      <Topbar title={t("profile.title")} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
        <RefreshCircle width={20} height={20} style={{ animation: "spin 1s linear infinite", color: "var(--fg-3)" }} />
      </div>
    </>
  );

  const personas = [
    {
      value: "schulabgaenger" as const,
      img: imgSchulabgaenger,
      label: t("persona.schulabgaenger"),
      sub: t("persona.schulabgaengerSub"),
    },
    {
      value: "berufseinsteiger" as const,
      img: imgBerufseinsteiger,
      label: t("persona.berufseinsteiger"),
      sub: t("persona.berufseinsteigervSub"),
    },
    {
      value: "berufsumsteiger" as const,
      img: imgBerufsumsteiger,
      label: t("persona.berufsumsteiger"),
      sub: t("persona.berufsumsteigerSub"),
    },
  ];

  return (
    <>
      <Topbar
        title={t("profile.title")}
        sub={t("profile.sub")}
        actions={
          <button
            className={"btn " + (saving ? "btn-secondary" : "btn-primary")}
            onClick={() => save()}
            disabled={saving}
          >
            {saving ? <RefreshCircle width={13} height={13} style={{ animation: "spin 1s linear infinite" }} /> : <FloppyDisk width={13} height={13} />}
            {saved ? t("profile.saved") : t("profile.save")}
          </button>
        }
      />
      <div className="page-content" style={{ maxWidth: 720 }}>

        {/* Persona selector */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div className="eyebrow">{t("profile.focus")}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {personas.map(p => {
              const active = (profile.persona ?? "") === p.value;
              return (
                <button
                  key={p.value}
                  onClick={() => {
                    setProfile(prev => ({ ...prev, persona: p.value }));
                    save({ persona: p.value });
                  }}
                  style={{
                    padding: 0, borderRadius: 12, textAlign: "left",
                    border: `2px solid ${active ? "var(--accent)" : "var(--border)"}`,
                    background: active ? "var(--accent-08)" : "var(--surface-2)",
                    cursor: "pointer", fontFamily: "var(--font-sans)",
                    transition: "all 0.15s ease",
                    display: "flex", flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  {/* Full-bleed image */}
                  <div style={{
                    width: "100%", aspectRatio: "16/9",
                    overflow: "hidden",
                    background: "#0a0a0a",
                    borderBottom: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                  }}>
                    <img
                      src={p.img}
                      alt={p.label}
                      style={{
                        width: "100%", height: "100%",
                        objectFit: "cover", objectPosition: "center top",
                        display: "block",
                        // No inversion — the illustrations work as-is in both themes
                        filter: "brightness(0.85) contrast(1.05)",
                        opacity: active ? 1 : 0.7,
                        transition: "opacity 0.15s",
                      }}
                    />
                  </div>
                  {/* Text */}
                  <div style={{ padding: "10px 14px 12px" }}>
                    <div style={{ fontSize: 13, fontWeight: active ? 700 : 600, color: active ? "var(--accent)" : "var(--fg-1)", marginBottom: 3 }}>
                      {p.label}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--fg-3)", lineHeight: 1.4 }}>
                      {p.sub}
                    </div>
                    {active && (
                      <div style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700, marginTop: 6 }}>
                        {t("profile.active")}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {!(profile.persona) && (
            <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 8 }}>
              {t("profile.focusHint")}
            </div>
          )}
        </div>

        {/* Personal Info */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <User width={14} height={14} style={{ color: "var(--accent)" }} />
            <div className="eyebrow">{t("profile.personalInfo")}</div>
          </div>
          <div className="settings-group">
            <div className="settings-row">
              {/* Avatar preview */}
              <div style={{ display: "flex", gap: 16, alignItems: "center", width: "100%" }}>
                <div style={{
                  width: 64, height: 64, borderRadius: "50%",
                  background: profile.photoUrl ? "transparent" : "var(--accent)",
                  overflow: "hidden", flexShrink: 0, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: 22, fontWeight: 700, color: "#fff"
                }}>
                  {profile.photoUrl
                    ? <img src={profile.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : (profile.name?.slice(0, 1) || "U")}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>{t("profile.photoUrl")}</div>
                    <input {...field("photoUrl")} placeholder="https://…" />
                  </div>
                </div>
              </div>
            </div>
            <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px" }}>
                {([
                  { key: "name",     label: t("contacts.name").replace(" *","") + " *", placeholder: t("profile.namePlaceholder"),     type: "text"  },
                  { key: "email",    label: t("contacts.email"),                         placeholder: t("profile.emailPlaceholder"),    type: "email" },
                  { key: "phone",    label: t("contacts.phone"),                         placeholder: t("profile.phonePlaceholder"),    type: "text"  },
                  { key: "location", label: t("overview.location"),                      placeholder: t("profile.locationPlaceholder"), type: "text"  },
                ] as { key: keyof typeof profile; label: string; placeholder: string; type: string }[]).map(({ key, label, placeholder, type }) => (
                  <div key={key} style={{ paddingBottom: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
                    <input {...field(key)} placeholder={placeholder} type={type} />
                  </div>
                ))}
              </div>
              <div style={{ paddingBottom: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>{t("profile.headline")}</div>
                <input
                  {...field("headline")}
                  placeholder={t("profile.headlinePlaceholder")}
                />
              </div>
            </div>
          </div>
        </div>

        {/* LinkedIn */}
        <div style={{
          marginBottom: 32,
          ...(linkedinExpanded ? {
            position: "absolute", top: 57, left: 0, right: 0, bottom: 0,
            zIndex: 10, background: "var(--bg)", padding: "24px 32px",
            display: "flex", flexDirection: "column", overflow: "auto"
          } : {})
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Linkedin width={14} height={14} style={{ color: "#0a66c2" }} />
            <div className="eyebrow" style={{ flex: 1 }}>{t("profile.linkedinSection")}</div>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setLinkedinExpanded((v) => !v)}
              title={linkedinExpanded ? t("activities.minimize") : t("activities.maximize")}
              style={{ padding: 4 }}
            >
              {linkedinExpanded ? <Collapse width={14} height={14} /> : <Expand width={14} height={14} />}
            </button>
          </div>
          <div className="settings-group" style={linkedinExpanded ? { flex: 1, display: "flex", flexDirection: "column" } : {}}>
            <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12, ...(linkedinExpanded ? { flex: 1 } : {}) }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("contacts.linkedin")}</div>
                  {profile.linkedinUrl && (
                    <a href={profile.linkedinUrl} target="_blank" rel="noreferrer"
                      style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--accent)", fontSize: 10, fontWeight: 600, textDecoration: "none" }}>
                      <OpenNewWindow width={10} height={10} /> {t("profile.openProfile")}
                    </a>
                  )}
                </div>
                <input {...field("linkedinUrl")} placeholder="https://linkedin.com/in/dein-name" />
              </div>
              <div style={linkedinExpanded ? { flex: 1, display: "flex", flexDirection: "column" } : {}}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
                  {t("profile.linkedinBioLabel")}
                </div>
                {linkedinExpanded ? (
                  <textarea
                    value={profile.linkedinBio ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, linkedinBio: e.target.value }))}
                    onBlur={() => save({ linkedinBio: profile.linkedinBio })}
                    placeholder={t("profile.linkedinBioPlaceholder")}
                    style={{ flex: 1, resize: "none", minHeight: 200, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--fg-1)", fontFamily: "var(--font-sans)", fontSize: 13, outline: "none" }}
                  />
                ) : (
                  <AutoResizeTextarea
                    value={profile.linkedinBio ?? ""}
                    onChange={(v) => setProfile((p) => ({ ...p, linkedinBio: v }))}
                    placeholder={t("profile.linkedinBioPlaceholder")}
                    minRows={4}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Master CV */}
        <div style={{
          marginBottom: 32,
          ...(cvExpanded ? {
            position: "absolute", top: 57, left: 0, right: 0, bottom: 0,
            zIndex: 10, background: "var(--bg)", padding: "24px 32px",
            display: "flex", flexDirection: "column", overflow: "auto"
          } : {})
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Page width={14} height={14} style={{ color: "var(--accent)" }} />
            <div className="eyebrow" style={{ flex: 1 }}>{t("profile.masterCv")}</div>
            {/* Vorschau / Bearbeiten toggle */}
            <div style={{ display: "flex", gap: 2, background: "var(--surface-2)", borderRadius: 6, padding: 2 }}>
              {(["preview", "edit"] as const).map(m => (
                <button key={m} onClick={() => setCvMode(m)} style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "none", cursor: "pointer",
                  background: cvMode === m ? "var(--surface)" : "transparent",
                  color: cvMode === m ? "var(--fg-1)" : "var(--fg-3)",
                  fontFamily: "var(--font-sans)", fontWeight: 600,
                }}>
                  {m === "preview" ? t("description.preview") : t("description.edit")}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 10, color: "var(--fg-3)", marginLeft: 4 }}>
              {(profile.masterCv?.length ?? 0).toLocaleString()} Z.
            </span>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setCvExpanded((v) => !v)}
              title={cvExpanded ? t("activities.minimize") : t("activities.maximize")}
              style={{ padding: 4 }}
            >
              {cvExpanded ? <Collapse width={14} height={14} /> : <Expand width={14} height={14} />}
            </button>
          </div>
          {!cvExpanded && (
            <div style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 14 }}>
              {t("profile.masterCvHint")}
            </div>
          )}
          <div className="settings-group" style={cvExpanded ? { flex: 1, display: "flex", flexDirection: "column" } : {}}>
            <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", ...(cvExpanded ? { flex: 1 } : {}) }}>
              <div className="field" style={cvExpanded ? { flex: 1, display: "flex", flexDirection: "column" } : {}}>
                {cvMode === "preview" ? (
                  <div
                    className="md-body"
                    style={{
                      padding: "12px 14px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--surface-2)",
                      overflow: "auto",
                      ...(cvExpanded
                        ? { flex: 1 }
                        : { maxHeight: 480, minHeight: 160 }),
                    }}
                  >
                    {profile.masterCv
                      ? <ReactMarkdown remarkPlugins={[remarkGfm]}
                          components={{ a: ({ href, children }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                          )}}>
                          {profile.masterCv}
                        </ReactMarkdown>
                      : <div style={{ fontSize: 12, color: "var(--fg-3)", fontStyle: "italic" }}>
                          {t("profile.masterCvEmpty")}
                        </div>
                    }
                  </div>
                ) : cvExpanded ? (
                  <textarea
                    value={profile.masterCv ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, masterCv: e.target.value }))}
                    onBlur={() => save({ masterCv: profile.masterCv })}
                    placeholder={t("profile.masterCvPlaceholder")}
                    style={{ flex: 1, resize: "none", minHeight: 200, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--fg-1)", fontFamily: "var(--font-sans)", fontSize: 13, outline: "none" }}
                  />
                ) : (
                  <AutoResizeTextarea
                    value={profile.masterCv ?? ""}
                    onChange={(v) => setProfile((p) => ({ ...p, masterCv: v }))}
                    placeholder={t("profile.masterCvPlaceholder")}
                    minRows={12}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Personal Notes */}
        <div style={{
          marginBottom: 32,
          ...(notesExpanded ? {
            position: "absolute", top: 57, left: 0, right: 0, bottom: 0,
            zIndex: 10, background: "var(--bg)", padding: "24px 32px",
            display: "flex", flexDirection: "column", overflow: "auto"
          } : {})
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <LightBulb width={14} height={14} style={{ color: "#f59e0b" }} />
            <div className="eyebrow" style={{ flex: 1 }}>{t("profile.personalNotes")}</div>
            {/* Vorschau / Bearbeiten toggle */}
            <div style={{ display: "flex", gap: 2, background: "var(--surface-2)", borderRadius: 6, padding: 2 }}>
              {(["preview", "edit"] as const).map(m => (
                <button key={m} onClick={() => setNotesMode(m)} style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "none", cursor: "pointer",
                  background: notesMode === m ? "var(--surface)" : "transparent",
                  color: notesMode === m ? "var(--fg-1)" : "var(--fg-3)",
                  fontFamily: "var(--font-sans)", fontWeight: 600,
                }}>
                  {m === "preview" ? t("description.preview") : t("description.edit")}
                </button>
              ))}
            </div>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setNotesExpanded((v) => !v)}
              title={notesExpanded ? t("activities.minimize") : t("activities.maximize")}
              style={{ padding: 4 }}
            >
              {notesExpanded ? <Collapse width={14} height={14} /> : <Expand width={14} height={14} />}
            </button>
          </div>
          <div style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 14, lineHeight: 1.6 }}>
            <span style={{ color: "#f59e0b", fontWeight: 600 }}>{t("profile.personalNotesHintLabel")}</span>{" "}
            {t("profile.personalNotesHint")}
          </div>
          <div className="settings-group" style={notesExpanded ? { flex: 1, display: "flex", flexDirection: "column" } : {}}>
            <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", ...(notesExpanded ? { flex: 1 } : {}) }}>
              <div className="field" style={notesExpanded ? { flex: 1, display: "flex", flexDirection: "column" } : {}}>
                {notesMode === "preview" ? (
                  <div
                    className="md-body"
                    style={{
                      padding: "12px 14px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--surface-2)",
                      overflow: "auto",
                      ...(notesExpanded
                        ? { flex: 1 }
                        : { maxHeight: 320, minHeight: 80 }),
                    }}
                  >
                    {profile.personalNotes
                      ? <ReactMarkdown remarkPlugins={[remarkGfm]}
                          components={{ a: ({ href, children }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                          )}}>
                          {profile.personalNotes}
                        </ReactMarkdown>
                      : <div style={{ fontSize: 12, color: "var(--fg-3)", fontStyle: "italic" }}>
                          {t("profile.personalNotesEmpty")}
                        </div>
                    }
                  </div>
                ) : notesExpanded ? (
                  <textarea
                    value={profile.personalNotes ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, personalNotes: e.target.value }))}
                    onBlur={() => save({ personalNotes: profile.personalNotes })}
                    placeholder={t("profile.personalNotesPlaceholder")}
                    style={{ flex: 1, resize: "none", minHeight: 200, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--fg-1)", fontFamily: "var(--font-sans)", fontSize: 13, outline: "none" }}
                  />
                ) : (
                  <AutoResizeTextarea
                    value={profile.personalNotes ?? ""}
                    onChange={(v) => setProfile((p) => ({ ...p, personalNotes: v }))}
                    onBlur={() => save({ personalNotes: profile.personalNotes })}
                    placeholder={t("profile.personalNotesPlaceholder")}
                    minRows={4}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Desired salary */}
        <div className="settings-group">
          <div className="settings-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("profile.desiredSalary")}</label>
              <input
                type="number"
                value={profile.desiredSalary ?? ""}
                onChange={(e) => setProfile((p) => ({ ...p, desiredSalary: e.target.value }))}
                onBlur={() => save({ desiredSalary: profile.desiredSalary })}
                placeholder={t("profile.desiredSalaryPlaceholder")}
                style={{ maxWidth: 200 }}
              />
              <span className="field-hint">{t("profile.desiredSalaryHint")}</span>
            </div>
          </div>
        </div>

        <div className="autosave-indicator">
          <span className="dot" style={{ background: saved ? "var(--accent)" : "var(--green)" }} />
          {saved ? t("saved") : t("profile.autosave")}
        </div>

      </div>
    </>
  );
}

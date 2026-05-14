import { useState, useEffect, useRef, useCallback } from "react";
import { ExternalLink, Save, User, Linkedin, FileText, Loader, Maximize2, Minimize2, Lightbulb } from "lucide-react";
import { Topbar } from "../components/Topbar";
import { api } from "../lib/api";
import type { UserProfile } from "@application-pal/shared";

function AutoResizeTextarea({ value, onChange, placeholder, minRows = 4 }: {
  value: string;
  onChange: (v: string) => void;
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
      placeholder={placeholder}
      rows={minRows}
      style={{ resize: "none", overflow: "hidden", background: "transparent", color: "var(--fg-1)", fontFamily: "var(--font-sans)", fontSize: 13, outline: "none" }}
    />
  );
}

// Notion-style underline — use className="input-line" instead of inline styles

export function ProfilePage() {
  const [profile, setProfile] = useState<Partial<UserProfile>>({
    name: "", email: "", phone: "", location: "", headline: "",
    linkedinUrl: "", linkedinBio: "", photoUrl: "", masterCv: "", personalNotes: ""
  });
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [linkedinExpanded, setLinkedinExpanded] = useState(false);
  const [cvExpanded, setCvExpanded] = useState(false);

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
      <Topbar title="Profil" />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
        <Loader size={20} style={{ animation: "spin 1s linear infinite", color: "var(--fg-3)" }} />
      </div>
    </>
  );

  return (
    <>
      <Topbar
        title="Profil"
        sub="Master-CV und persönliche Angaben für alle Bewerbungen"
        actions={
          <button
            className={"btn " + (saving ? "btn-secondary" : "btn-primary")}
            onClick={() => save()}
            disabled={saving}
          >
            {saving ? <Loader size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={13} />}
            {saved ? "Gespeichert" : "Speichern"}
          </button>
        }
      />
      <div className="page-content" style={{ maxWidth: 720 }}>

        {/* Personal Info */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <User size={14} style={{ color: "var(--accent)" }} />
            <div className="eyebrow">Persönliche Angaben</div>
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
                    <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>Foto-URL (z.B. LinkedIn-Profilbild)</div>
                    <input {...field("photoUrl")} placeholder="https://…" />
                  </div>
                </div>
              </div>
            </div>
            <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px" }}>
                {([
                  { key: "name",     label: "Name *",                  placeholder: "Dein vollständiger Name",   type: "text"  },
                  { key: "email",    label: "E-Mail",                   placeholder: "du@beispiel.com",            type: "email" },
                  { key: "phone",    label: "Telefon",                  placeholder: "+41 79 123 45 67",           type: "text"  },
                  { key: "location", label: "Ort",                      placeholder: "Zürich, Schweiz",            type: "text"  },
                ] as { key: keyof typeof profile; label: string; placeholder: string; type: string }[]).map(({ key, label, placeholder, type }) => (
                  <div key={key} style={{ paddingBottom: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
                    <input {...field(key)} placeholder={placeholder} type={type} />
                  </div>
                ))}
              </div>
              <div style={{ paddingBottom: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>Headline / Kurzbeschreibung</div>
                <input
                  {...field("headline")}
                  placeholder="Senior UX Designer · 8 Jahre Erfahrung · Figma & Design Systems"
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
            <Linkedin size={14} style={{ color: "#0a66c2" }} />
            <div className="eyebrow" style={{ flex: 1 }}>LinkedIn Profil</div>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setLinkedinExpanded((v) => !v)}
              title={linkedinExpanded ? "Minimieren" : "Maximieren"}
              style={{ padding: 4 }}
            >
              {linkedinExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
          <div className="settings-group" style={linkedinExpanded ? { flex: 1, display: "flex", flexDirection: "column" } : {}}>
            <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12, ...(linkedinExpanded ? { flex: 1 } : {}) }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>LinkedIn URL</div>
                  {profile.linkedinUrl && (
                    <a href={profile.linkedinUrl} target="_blank" rel="noreferrer"
                      style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--accent)", fontSize: 10, fontWeight: 600, textDecoration: "none" }}>
                      <ExternalLink size={10} /> Profil öffnen
                    </a>
                  )}
                </div>
                <input {...field("linkedinUrl")} placeholder="https://linkedin.com/in/dein-name" />
              </div>
              <div style={linkedinExpanded ? { flex: 1, display: "flex", flexDirection: "column" } : {}}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
                  Profil-Bio / Zusammenfassung
                </div>
                {linkedinExpanded ? (
                  <textarea
                    value={profile.linkedinBio ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, linkedinBio: e.target.value }))}
                    onBlur={() => save({ linkedinBio: profile.linkedinBio })}
                    placeholder="Kopiere hier deine LinkedIn About-Section ein…"
                    style={{ flex: 1, resize: "none", minHeight: 200, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--fg-1)", fontFamily: "var(--font-sans)", fontSize: 13, outline: "none" }}
                  />
                ) : (
                  <AutoResizeTextarea
                    value={profile.linkedinBio ?? ""}
                    onChange={(v) => setProfile((p) => ({ ...p, linkedinBio: v }))}
                    placeholder="Kopiere hier deine LinkedIn About-Section ein…"
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
            <FileText size={14} style={{ color: "var(--accent)" }} />
            <div className="eyebrow" style={{ flex: 1 }}>Master-Lebenslauf</div>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setCvExpanded((v) => !v)}
              title={cvExpanded ? "Minimieren" : "Maximieren"}
              style={{ padding: 4 }}
            >
              {cvExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
          {!cvExpanded && (
            <div style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 14 }}>
              Dieser Text dient als Basis für alle KI-generierten CV-Tailorings. Je detaillierter, desto besser die Ergebnisse.
            </div>
          )}
          <div className="settings-group" style={cvExpanded ? { flex: 1, display: "flex", flexDirection: "column" } : {}}>
            <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", ...(cvExpanded ? { flex: 1 } : {}) }}>
              <div className="field" style={cvExpanded ? { flex: 1, display: "flex", flexDirection: "column" } : {}}>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>Lebenslauf (Volltext, Markdown möglich)</span>
                  <span style={{ fontSize: 10, color: "var(--fg-3)", fontWeight: 400 }}>
                    {(profile.masterCv?.length ?? 0).toLocaleString()} Zeichen
                  </span>
                </label>
                {cvExpanded ? (
                  <textarea
                    value={profile.masterCv ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, masterCv: e.target.value }))}
                    onBlur={() => save({ masterCv: profile.masterCv })}
                    placeholder={`# [Dein Name]\n\n## Berufserfahrung\n\n**Senior UX Designer** · Firma GmbH (2021–heute)\n- Verantwortlich für…`}
                    style={{ flex: 1, resize: "none", minHeight: 200, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--fg-1)", fontFamily: "var(--font-sans)", fontSize: 13, outline: "none" }}
                  />
                ) : (
                  <AutoResizeTextarea
                    value={profile.masterCv ?? ""}
                    onChange={(v) => setProfile((p) => ({ ...p, masterCv: v }))}
                    placeholder={`# [Dein Name]\n\n## Berufserfahrung\n\n**Senior UX Designer** · Firma GmbH (2021–heute)\n- Verantwortlich für…\n\n## Ausbildung\n\n## Skills\n\nFigma, UX Research, Prototyping, Design Systems…`}
                    minRows={12}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Personal Notes — für Match-Score & Interview */}
        <div style={{
          marginBottom: 32,
          ...(notesExpanded ? {
            position: "absolute", top: 57, left: 0, right: 0, bottom: 0,
            zIndex: 10, background: "var(--bg)", padding: "24px 32px",
            display: "flex", flexDirection: "column", overflow: "auto"
          } : {})
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Lightbulb size={14} style={{ color: "#f59e0b" }} />
            <div className="eyebrow" style={{ flex: 1 }}>Persönliche Stichpunkte</div>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setNotesExpanded((v) => !v)}
              title={notesExpanded ? "Minimieren" : "Maximieren"}
              style={{ padding: 4 }}
            >
              {notesExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
          <div style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 14, lineHeight: 1.6 }}>
            <span style={{ color: "#f59e0b", fontWeight: 600 }}>Für Match-Score & Interviews:</span>{" "}
            Notiere hier persönliche Prioritäten, Gehaltsvorstellungen, bevorzugte Arbeitsweise, besondere Stärken oder Punkte die dir in Bewerbungsgesprächen wichtig sind. Diese Informationen fliessen in die KI-Analyse ein.
          </div>
          <div className="settings-group" style={notesExpanded ? { flex: 1, display: "flex", flexDirection: "column" } : {}}>
            <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", ...(notesExpanded ? { flex: 1 } : {}) }}>
              <div className="field" style={notesExpanded ? { flex: 1, display: "flex", flexDirection: "column" } : {}}>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>Stichpunkte (Freitext)</span>
                  <span style={{ fontSize: 10, color: "var(--fg-3)", fontWeight: 400 }}>
                    {(profile.personalNotes?.length ?? 0).toLocaleString()} Zeichen
                  </span>
                </label>
                {notesExpanded ? (
                  <textarea
                    value={profile.personalNotes ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, personalNotes: e.target.value }))}
                    onBlur={() => save({ personalNotes: profile.personalNotes })}
                    placeholder={`- Gehaltsvorstellung: CHF 110–130k\n- Remote-first bevorzugt, gerne 1–2 Tage Büro\n- Stärken: UX Research, Design Systems, Team-Führung\n- Wichtig: flache Hierarchien, agiles Umfeld\n- Sprachen: Deutsch (Muttersprache), Englisch (C1)`}
                    style={{ flex: 1, resize: "none", minHeight: 200, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--fg-1)", fontFamily: "var(--font-sans)", fontSize: 13, outline: "none" }}
                  />
                ) : (
                  <textarea
                    value={profile.personalNotes ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, personalNotes: e.target.value }))}
                    onBlur={() => save({ personalNotes: profile.personalNotes })}
                    placeholder={`- Gehaltsvorstellung: CHF 110–130k\n- Remote-first bevorzugt\n- Stärken: UX Research, Design Systems\n- Wichtig: flache Hierarchien, agiles Umfeld`}
                    rows={4}
                    style={{ resize: "vertical", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--fg-1)", fontFamily: "var(--font-sans)", fontSize: 13, outline: "none", width: "100%" }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="autosave-indicator">
          <span className="dot" style={{ background: saved ? "var(--accent)" : "var(--green)" }} />
          {saved ? "Gespeichert." : "Änderungen werden beim Verlassen des Felds gespeichert."}
        </div>

      </div>
    </>
  );
}

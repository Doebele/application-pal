import { useState, useEffect, useRef, useCallback } from "react";
import { ExternalLink, Save, User, Linkedin, FileText, Loader } from "lucide-react";
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
      style={{ resize: "none", overflow: "hidden" }}
    />
  );
}

const FIELD_STYLE: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--fg-1)",
  fontFamily: "var(--font-sans)",
  fontSize: 13,
  width: "100%",
  outline: "none"
};

export function ProfilePage() {
  const [profile, setProfile] = useState<Partial<UserProfile>>({
    name: "", email: "", phone: "", location: "", headline: "",
    linkedinUrl: "", linkedinBio: "", photoUrl: "", masterCv: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    value: (profile[key] as string) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setProfile((p) => ({ ...p, [key]: e.target.value })),
    onBlur: () => save({ [key]: profile[key] } as Partial<UserProfile>),
    style: FIELD_STYLE
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
                  <div className="field" style={{ marginBottom: 8 }}>
                    <label>Foto-URL (z.B. LinkedIn-Profilbild)</label>
                    <input {...field("photoUrl")} placeholder="https://…" />
                  </div>
                </div>
              </div>
            </div>
            <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field">
                  <label>Name *</label>
                  <input {...field("name")} placeholder="Dein vollständiger Name" />
                </div>
                <div className="field">
                  <label>E-Mail</label>
                  <input {...field("email")} placeholder="du@beispiel.com" type="email" />
                </div>
                <div className="field">
                  <label>Telefon</label>
                  <input {...field("phone")} placeholder="+41 79 123 45 67" />
                </div>
                <div className="field">
                  <label>Ort</label>
                  <input {...field("location")} placeholder="Zürich, Schweiz" />
                </div>
              </div>
              <div className="field">
                <label>Headline / Kurzbeschreibung</label>
                <input
                  {...field("headline")}
                  placeholder="Senior UX Designer · 8 Jahre Erfahrung · Figma & Design Systems"
                />
              </div>
            </div>
          </div>
        </div>

        {/* LinkedIn */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Linkedin size={14} style={{ color: "#0a66c2" }} />
            <div className="eyebrow">LinkedIn Profil</div>
          </div>
          <div className="settings-group">
            <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
              <div className="field">
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>LinkedIn URL</span>
                  {profile.linkedinUrl && (
                    <a href={profile.linkedinUrl} target="_blank" rel="noreferrer"
                      style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--accent)", fontSize: 10, fontWeight: 600, textDecoration: "none" }}>
                      <ExternalLink size={10} /> Profil öffnen
                    </a>
                  )}
                </label>
                <input {...field("linkedinUrl")} placeholder="https://linkedin.com/in/dein-name" />
              </div>
              <div className="field">
                <label>Profil-Bio / Zusammenfassung</label>
                <AutoResizeTextarea
                  value={profile.linkedinBio ?? ""}
                  onChange={(v) => setProfile((p) => ({ ...p, linkedinBio: v }))}
                  placeholder="Kopiere hier deine LinkedIn About-Section ein…"
                  minRows={4}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Master CV */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <FileText size={14} style={{ color: "var(--accent)" }} />
            <div className="eyebrow">Master-Lebenslauf</div>
          </div>
          <div style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 14 }}>
            Dieser Text dient als Basis für alle KI-generierten CV-Tailorings. Je detaillierter, desto besser die Ergebnisse.
          </div>
          <div className="settings-group">
            <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div className="field">
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>Lebenslauf (Volltext, Markdown möglich)</span>
                  <span style={{ fontSize: 10, color: "var(--fg-3)", fontWeight: 400 }}>
                    {(profile.masterCv?.length ?? 0).toLocaleString()} Zeichen
                  </span>
                </label>
                <AutoResizeTextarea
                  value={profile.masterCv ?? ""}
                  onChange={(v) => setProfile((p) => ({ ...p, masterCv: v }))}
                  placeholder={`# [Dein Name]\n\n## Berufserfahrung\n\n**Senior UX Designer** · Firma GmbH (2021–heute)\n- Verantwortlich für…\n\n## Ausbildung\n\n## Skills\n\nFigma, UX Research, Prototyping, Design Systems…`}
                  minRows={12}
                />
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

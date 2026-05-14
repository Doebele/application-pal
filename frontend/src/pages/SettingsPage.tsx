import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, CheckCircle, AlertCircle, Loader, Link2, Unlink, Download, Upload, Database, Shield, Key, LogOut, Trash2, FolderOpen, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Topbar } from "../components/Topbar";
import { useUiStore, type Accent, type Density, type CardVariant, type AiProvider, DEFAULT_FOLDER_RULE, DEFAULT_DOC_RULE } from "../lib/store";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";

const ACCENT_SWATCHES: { value: Accent; color: string; label: string }[] = [
  { value: "indigo",  color: "#3b82f6", label: "Indigo" },
  { value: "violet",  color: "#8b5cf6", label: "Violet" },
  { value: "emerald", color: "#10b981", label: "Emerald" },
  { value: "amber",   color: "#f59e0b", label: "Amber" },
  { value: "rose",    color: "#f43f5e", label: "Rose" },
];

const INPUT_STYLE: React.CSSProperties = {
  padding: "6px 10px", borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--fg-1)",
  fontFamily: "var(--font-sans)",
  fontSize: 12,
  outline: "none",
  width: "100%",
  transition: "border-color 0.12s ease"
};

// ─── LM Studio model picker ───────────────────────────────────
function LmStudioSection() {
  const { ai, setAi } = useUiStore();
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");

  const fetchModels = async (url: string) => {
    setStatus("loading");
    try {
      const res = await api.get<{ models: string[] }>(`/api/lm-studio/models?url=${encodeURIComponent(url)}`);
      const list = res.data.models;
      setModels(list);
      setStatus(list.length > 0 ? "ok" : "error");
      if (list.length > 0 && !ai.lmStudioModel) {
        setAi({ lmStudioModel: list[0] });
      }
    } catch {
      setStatus("error");
      setModels([]);
    }
  };

  useEffect(() => {
    if (ai.provider === "lm-studio") {
      fetchModels(ai.lmStudioUrl || "http://localhost:1234");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.provider]);

  return (
    <>
      <div className="settings-row">
        <div>
          <div className="settings-row-label">LM Studio URL</div>
          <div className="settings-row-sub">Default: http://localhost:1234</div>
        </div>
        <div className="settings-row-right" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            value={ai.lmStudioUrl}
            onChange={(e) => setAi({ lmStudioUrl: e.target.value })}
            placeholder="http://localhost:1234"
            style={{ ...INPUT_STYLE, width: 200, fontFamily: "var(--font-mono)", fontSize: 11 }}
          />
          <button
            className="btn btn-secondary btn-icon"
            onClick={() => fetchModels(ai.lmStudioUrl || "http://localhost:1234")}
            title="Test connection"
          >
            {status === "loading"
              ? <Loader size={13} style={{ animation: "spin 1s linear infinite" }} />
              : <RefreshCw size={13} />}
          </button>
          {status === "ok"    && <CheckCircle size={14} style={{ color: "var(--green)", flexShrink: 0 }} />}
          {status === "error" && <AlertCircle size={14} style={{ color: "var(--red)", flexShrink: 0 }} />}
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row-label">Model</div>
          <div className="settings-row-sub">
            {status === "error"
              ? "LM Studio not reachable — start it and click ↻"
              : status === "idle"
                ? "Click ↻ to load available models"
                : models.length === 0
                  ? "No models loaded in LM Studio"
                  : `${models.length} model${models.length !== 1 ? "s" : ""} available`}
          </div>
        </div>
        <div className="settings-row-right">
          {models.length > 0 ? (
            <select
              value={ai.lmStudioModel}
              onChange={(e) => setAi({ lmStudioModel: e.target.value })}
              style={{ ...INPUT_STYLE, width: 260, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 11 }}
            >
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input
              value={ai.lmStudioModel}
              onChange={(e) => setAi({ lmStudioModel: e.target.value })}
              placeholder="e.g. mistral-7b-instruct"
              style={{ ...INPUT_STYLE, width: 260, fontFamily: "var(--font-mono)", fontSize: 11 }}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ─── Anthropic section ────────────────────────────────────────
function AnthropicSection() {
  const { ai, setAi } = useUiStore();
  const [show, setShow] = useState(false);

  return (
    <div className="settings-row">
      <div>
        <div className="settings-row-label">Anthropic API Key</div>
        <div className="settings-row-sub">Used for job extraction and AI agent features</div>
      </div>
      <div className="settings-row-right" style={{ display: "flex", gap: 6 }}>
        <input
          type={show ? "text" : "password"}
          value={ai.anthropicApiKey}
          onChange={(e) => setAi({ anthropicApiKey: e.target.value })}
          placeholder="sk-ant-…"
          style={{ ...INPUT_STYLE, width: 220, fontFamily: "var(--font-mono)", fontSize: 11 }}
        />
        <button
          className="btn btn-ghost"
          style={{ fontSize: 11, padding: "4px 8px", flexShrink: 0 }}
          onClick={() => setShow((s) => !s)}
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

// ─── Provider selector pill ───────────────────────────────────
function ProviderPill({ value, label, active, onClick, color }: {
  value: AiProvider; label: string; active: boolean; onClick: () => void; color?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 999,
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        background: active ? "var(--accent-08)" : "transparent",
        color: active ? "var(--accent)" : "var(--fg-2)",
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        fontFamily: "var(--font-sans)",
        display: "flex",
        alignItems: "center",
        gap: 6,
        transition: "all 0.12s ease"
      }}
    >
      {color && (
        <span style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }} />
      )}
      {label}
    </button>
  );
}

// ─── Google OAuth section ─────────────────────────────────────
function GoogleSection() {
  const { driveApplicationsFolderId, setDriveApplicationsFolderId } = useUiStore();
  const [status, setStatus] = useState<"loading" | "connected" | "disconnected">("loading");
  const [folderInput, setFolderInput] = useState(driveApplicationsFolderId);
  const [folderInfo, setFolderInfo]   = useState<{ id: string; name: string; url: string } | null>(null);
  const [folderErr, setFolderErr]     = useState<string | null>(null);
  const [checkingFolder, setCheckingFolder] = useState(false);

  const check = useCallback(() => {
    api.get<{ connected: boolean }>("/api/google/status")
      .then((r) => setStatus(r.data.connected ? "connected" : "disconnected"))
      .catch(() => setStatus("disconnected"));
  }, []);

  useEffect(() => { check(); }, [check]);

  // Validate saved folder ID on mount
  useEffect(() => {
    if (driveApplicationsFolderId && status === "connected") {
      api.get<{ id: string; name: string; url: string }>(`/api/drive/folder-info?folderId=${driveApplicationsFolderId}`)
        .then(r => setFolderInfo(r.data))
        .catch(() => {});
    }
  }, [driveApplicationsFolderId, status]);

  /** Extract folder ID from a Google Drive URL or treat input as raw ID */
  const parseFolderId = (val: string): string => {
    const m = val.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : val.trim();
  };

  const validateFolder = async () => {
    const id = parseFolderId(folderInput);
    if (!id) { setFolderInfo(null); setDriveApplicationsFolderId(""); return; }
    setCheckingFolder(true); setFolderErr(null);
    try {
      const r = await api.get<{ id: string; name: string; url: string }>(`/api/drive/folder-info?folderId=${id}`);
      setFolderInfo(r.data);
      setDriveApplicationsFolderId(r.data.id);
      setFolderInput(r.data.id);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Ordner nicht gefunden";
      setFolderErr(msg); setFolderInfo(null);
    } finally { setCheckingFolder(false); }
  };

  const clearFolder = () => {
    setFolderInput(""); setFolderInfo(null); setFolderErr(null);
    setDriveApplicationsFolderId("");
  };

  const connect = async () => {
    const res = await api.get<{ url: string }>("/api/google/auth-url").catch(() => null);
    if (res?.data.url) window.location.href = res.data.url;
    else alert("Google credentials are not configured on the server.");
  };

  const disconnect = async () => {
    await api.delete("/api/google/disconnect").catch(() => {});
    setStatus("disconnected");
  };

  return (
    <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 14 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="settings-row-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>G</span> Google Drive & Docs
          </div>
          <div className="settings-row-sub">
            {status === "connected" ? "Verbunden — Dokumente werden automatisch in Drive erstellt" : "Dokumente manuell verknüpfen oder Drive verbinden"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {status === "loading" && <Loader size={14} style={{ animation: "spin 1s linear infinite", color: "var(--fg-3)" }} />}
          {status === "connected" && (
            <>
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--green)", fontWeight: 600 }}>
                <CheckCircle size={13} /> Verbunden
              </span>
              <button className="btn btn-ghost" style={{ fontSize: 11, gap: 4, padding: "4px 8px" }} onClick={disconnect}>
                <Unlink size={11} /> Trennen
              </button>
            </>
          )}
          {status === "disconnected" && (
            <button className="btn btn-primary" style={{ fontSize: 12, gap: 5 }} onClick={connect}>
              <Link2 size={12} /> Google verbinden
            </button>
          )}
        </div>
      </div>

      {/* Folder picker — only when connected */}
      {status === "connected" && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Ablageordner für Bewerbungsordner
          </div>
          <div style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 10, lineHeight: 1.5 }}>
            Neuer Bewerbungsordner wird in diesem Google Drive Verzeichnis erstellt. Leer lassen = direkt in „Meine Ablage".
          </div>

          {/* Current folder display */}
          {folderInfo ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.25)" }}>
              <span style={{ fontSize: 15 }}>📁</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)" }}>{folderInfo.name}</div>
                <div style={{ fontSize: 10, color: "var(--fg-3)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folderInfo.id}</div>
              </div>
              <a href={folderInfo.url} target="_blank" rel="noreferrer"
                style={{ color: "var(--accent)", display: "flex", flexShrink: 0 }} title="In Drive öffnen">
                <ExternalLink size={12} />
              </a>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={clearFolder}>
                Ändern
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <div className="field" style={{ flex: 1, margin: 0 }}>
                <input
                  value={folderInput}
                  onChange={e => setFolderInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && validateFolder()}
                  placeholder="Drive-Ordner URL einfügen: https://drive.google.com/drive/folders/…"
                  style={{ fontSize: 12 }}
                />
              </div>
              <button className="btn btn-secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}
                disabled={checkingFolder || !folderInput.trim()} onClick={validateFolder}>
                {checkingFolder ? <Loader size={11} style={{ animation: "spin 1s linear infinite" }} /> : "Bestätigen"}
              </button>
            </div>
          )}
          {folderErr && <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>{folderErr}</div>}
          {!folderInfo && !folderInput && (
            <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 6 }}>
              Aktuell: Neue Ordner werden direkt in „Meine Ablage" erstellt.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main SettingsPage ────────────────────────────────────────
// ─── Drive Naming Section ─────────────────────────────────────
const PLACEHOLDERS = ["{name}", "{firma}", "{rolle}", "{datum}", "{jahr}", "{monat}", "{doc}"];
const DUMMY: Record<string, string> = {
  name: "Claus Medvesek", firma: "Siemens", rolle: "Senior Designer",
  datum: "260514", jahr: "2026", monat: "05", doc: "CV Deutsch"
};

function previewRule(rule: string): string {
  return rule.replace(/\{(\w+)\}/g, (_, k) => DUMMY[k] ?? `{${k}}`);
}

function DriveNamingSection() {
  const { driveNameFolder, setDriveNameFolder, driveNameDoc, setDriveNameDoc } = useUiStore();
  const [folder, setFolder] = useState(driveNameFolder);
  const [doc, setDoc]       = useState(driveNameDoc);

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <FolderOpen size={13} style={{ color: "var(--fg-3)" }} />
        <div className="eyebrow">Google Drive Benennung</div>
      </div>
      <div className="settings-group">
        <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
          <div style={{ fontSize: 12, color: "var(--fg-3)", lineHeight: 1.6 }}>
            Regeln für die automatische Benennung von Drive-Ordnern und kopierten Dokumenten.{" "}
            <span style={{ color: "var(--fg-2)" }}>
              Platzhalter: {PLACEHOLDERS.map(p => (
                <code key={p} style={{ fontSize: 10, background: "var(--surface-2)", borderRadius: 3, padding: "1px 4px", margin: "0 2px" }}>{p}</code>
              ))}
            </span>
          </div>

          {/* Folder rule */}
          <div className="field" style={{ margin: 0 }}>
            <label>Ordnername-Regel</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={folder} onChange={e => setFolder(e.target.value)} onBlur={() => setDriveNameFolder(folder)}
                placeholder={DEFAULT_FOLDER_RULE} style={{ flex: 1 }} />
              <button className="btn btn-ghost" style={{ fontSize: 11, whiteSpace: "nowrap" }}
                onClick={() => { setFolder(DEFAULT_FOLDER_RULE); setDriveNameFolder(DEFAULT_FOLDER_RULE); }}>
                Zurücksetzen
              </button>
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 4 }}>
              Vorschau: <em style={{ color: "var(--fg-2)" }}>{previewRule(folder || DEFAULT_FOLDER_RULE)}</em>
            </div>
          </div>

          {/* Doc rule */}
          <div className="field" style={{ margin: 0 }}>
            <label>Dokumentname-Regel</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={doc} onChange={e => setDoc(e.target.value)} onBlur={() => setDriveNameDoc(doc)}
                placeholder={DEFAULT_DOC_RULE} style={{ flex: 1 }} />
              <button className="btn btn-ghost" style={{ fontSize: 11, whiteSpace: "nowrap" }}
                onClick={() => { setDoc(DEFAULT_DOC_RULE); setDriveNameDoc(DEFAULT_DOC_RULE); }}>
                Zurücksetzen
              </button>
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 4 }}>
              Vorschau: <em style={{ color: "var(--fg-2)" }}>{previewRule(doc || DEFAULT_DOC_RULE)}</em>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Security Section ─────────────────────────────────────────
type PasskeyInfo = { id: string; deviceName: string | null; createdAt: string };

function SecuritySection() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [creds, setCreds]         = useState<PasskeyInfo[]>([]);
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [passkeyMsg, setPasskeyMsg] = useState("");
  const [changePw, setChangePw]   = useState(false);
  const [currPw, setCurrPw]       = useState("");
  const [newPw, setNewPw]         = useState("");
  const [pwMsg, setPwMsg]         = useState("");

  const loadCreds = useCallback(async () => {
    const res = await api.get<PasskeyInfo[]>("/api/auth/webauthn/credentials").catch(() => null);
    if (res) setCreds(res.data);
  }, []);

  useEffect(() => { void loadCreds(); }, [loadCreds]);

  const addPasskey = async () => {
    setPasskeyMsg(""); setAddingPasskey(true);
    try {
      const optRes = await api.get<PublicKeyCredentialCreationOptionsJSON>("/api/auth/webauthn/register-options");
      const reg = await startRegistration({ optionsJSON: optRes.data });
      await api.post("/api/auth/webauthn/register", { response: reg, deviceName: deviceName || undefined });
      setPasskeyMsg("Passkey hinzugefügt ✓"); setDeviceName("");
      await loadCreds();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPasskeyMsg(msg ?? "Fehler bei der Passkey-Registrierung");
    } finally { setAddingPasskey(false); }
  };

  const deleteCred = async (id: string) => {
    await api.delete(`/api/auth/webauthn/credentials/${id}`);
    await loadCreds();
  };

  const changePassword = async () => {
    setPwMsg("");
    try {
      await api.post("/api/auth/change-password", { currentPassword: currPw, newPassword: newPw });
      setPwMsg("Passwort geändert ✓"); setCurrPw(""); setNewPw(""); setChangePw(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPwMsg(msg ?? "Fehler");
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const supportsPasskey = typeof window !== "undefined" && !!window.PublicKeyCredential;

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Shield size={13} style={{ color: "var(--fg-3)" }} />
        <div className="eyebrow">Sicherheit</div>
      </div>
      <div className="settings-group">

        {/* Current user */}
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Account</div>
            <div className="settings-row-sub">{user?.email}</div>
          </div>
          <button className="btn btn-secondary" style={{ gap: 6, fontSize: 12 }} onClick={handleLogout}>
            <LogOut size={12} /> Abmelden
          </button>
        </div>

        {/* Change password */}
        <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="settings-row-label">Passwort</div>
              <div className="settings-row-sub">Passwort ändern</div>
            </div>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setChangePw(v => !v)}>
              {changePw ? "Abbrechen" : "Ändern"}
            </button>
          </div>
          {changePw && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Aktuelles Passwort</label>
                <input type="password" value={currPw} onChange={e => setCurrPw(e.target.value)} placeholder="••••••••" />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Neues Passwort</label>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Mindestens 8 Zeichen" />
              </div>
              <button className="btn btn-primary" style={{ fontSize: 12, alignSelf: "flex-end" }} onClick={changePassword}>Speichern</button>
              {pwMsg && <div style={{ fontSize: 12, color: pwMsg.includes("✓") ? "#34d399" : "#f87171" }}>{pwMsg}</div>}
            </div>
          )}
        </div>

        {/* Passkeys */}
        {supportsPasskey && (
          <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div className="settings-row-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Key size={12} /> Passkeys
                </div>
                <div className="settings-row-sub">Face ID, Touch ID, Windows Hello</div>
              </div>
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setPasskeyMsg("")}>
                + Hinzufügen
              </button>
            </div>

            {/* Add passkey inline */}
            <div style={{ display: "flex", gap: 8 }}>
              <div className="field" style={{ flex: 1, margin: 0 }}>
                <label>Gerätename (optional)</label>
                <input value={deviceName} onChange={e => setDeviceName(e.target.value)} placeholder="z.B. MacBook Pro, iPhone 15" />
              </div>
              <button className="btn btn-primary" style={{ fontSize: 12, alignSelf: "flex-end" }} disabled={addingPasskey} onClick={addPasskey}>
                {addingPasskey ? "…" : "Registrieren"}
              </button>
            </div>
            {passkeyMsg && <div style={{ fontSize: 12, color: passkeyMsg.includes("✓") ? "#34d399" : "#f87171" }}>{passkeyMsg}</div>}

            {/* Registered passkeys list */}
            {creds.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {creds.map(cr => (
                  <div key={cr.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-1)" }}>{cr.deviceName ?? "Unbekanntes Gerät"}</div>
                      <div style={{ fontSize: 11, color: "var(--fg-3)" }}>Hinzugefügt: {new Date(cr.createdAt).toLocaleDateString("de-CH")}</div>
                    </div>
                    <button className="btn btn-ghost btn-icon" onClick={() => deleteCred(cr.id)} title="Entfernen"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

export function SettingsPage() {
  const { theme, setTheme, accent, setAccent, density, setDensity, cardVariant, setCardVariant, ai, setAi } = useUiStore();

  return (
    <>
      <Topbar title="Settings" />
      <div className="page-content" style={{ maxWidth: 680 }}>

        {/* Appearance */}
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Appearance</div>
          <div className="settings-group">
            <div className="settings-row">
              <div>
                <div className="settings-row-label">Theme</div>
                <div className="settings-row-sub">Switch between dark and light mode</div>
              </div>
              <div className="settings-row-right">
                <div className="theme-toggle">
                  <button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}>Light</button>
                  <button className={theme === "dark"  ? "active" : ""} onClick={() => setTheme("dark")}>Dark</button>
                </div>
              </div>
            </div>
            <div className="settings-row">
              <div>
                <div className="settings-row-label">Accent color</div>
                <div className="settings-row-sub">Primary interactive color</div>
              </div>
              <div className="settings-row-right">
                <div className="swatch-row">
                  {ACCENT_SWATCHES.map((s) => (
                    <button
                      key={s.value}
                      className={`swatch${accent === s.value ? " active" : ""}`}
                      style={{ background: s.color }}
                      title={s.label}
                      onClick={() => setAccent(s.value)}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="settings-row">
              <div>
                <div className="settings-row-label">Density</div>
                <div className="settings-row-sub">High = more info, Low = more whitespace</div>
              </div>
              <div className="settings-row-right">
                <div className="theme-toggle">
                  <button className={density === "high" ? "active" : ""} onClick={() => setDensity("high")}>High</button>
                  <button className={density === "low"  ? "active" : ""} onClick={() => setDensity("low")}>Low</button>
                </div>
              </div>
            </div>
            <div className="settings-row">
              <div>
                <div className="settings-row-label">Card style</div>
                <div className="settings-row-sub">Layout variant for Kanban cards</div>
              </div>
              <div className="settings-row-right">
                <select
                  value={cardVariant}
                  onChange={(e) => setCardVariant(e.target.value as CardVariant)}
                  style={{ ...INPUT_STYLE, width: 160, cursor: "pointer" }}
                >
                  <option value="rich">Rich (default)</option>
                  <option value="compact">Compact</option>
                  <option value="minimal">Minimal</option>
                  <option value="editorial">Editorial</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Profile */}
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Profile</div>
          <div className="settings-group">
            <div className="settings-row">
              <div style={{ width: 80, flexShrink: 0 }}>
                <div className="settings-row-label">Name</div>
              </div>
              <div style={{ flex: 1 }}>
                <input className="input-line" defaultValue="User" placeholder="Dein Name" />
              </div>
            </div>
            <div className="settings-row">
              <div style={{ width: 80, flexShrink: 0 }}>
                <div className="settings-row-label">Email</div>
              </div>
              <div style={{ flex: 1 }}>
                <input className="input-line" defaultValue="" placeholder="you@example.com" type="email" />
              </div>
            </div>
          </div>
        </div>

        {/* AI Integration */}
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>AI Integration</div>
          <div style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 14 }}>
            Used for intelligent job extraction, CV tailoring, and cover letter generation.
          </div>

          {/* Provider selector */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <ProviderPill
              value="none"
              label="None (regex only)"
              active={ai.provider === "none"}
              onClick={() => setAi({ provider: "none" })}
            />
            <ProviderPill
              value="lm-studio"
              label="LM Studio (local)"
              color="#10b981"
              active={ai.provider === "lm-studio"}
              onClick={() => setAi({ provider: "lm-studio" })}
            />
            <ProviderPill
              value="anthropic"
              label="Anthropic API"
              color="#f59e0b"
              active={ai.provider === "anthropic"}
              onClick={() => setAi({ provider: "anthropic" })}
            />
          </div>

          {ai.provider !== "none" && (
            <div className="settings-group">
              {ai.provider === "lm-studio"  && <LmStudioSection />}
              {ai.provider === "anthropic"  && <AnthropicSection />}
            </div>
          )}

          {ai.provider === "none" && (
            <div style={{
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              fontSize: 12,
              color: "var(--fg-3)",
              lineHeight: 1.6
            }}>
              Without AI, job extraction uses regex patterns — company name, role title, and location are detected
              from keywords. Select a provider above for accurate structured extraction including salary and tags.
            </div>
          )}
        </div>

        {/* Integrations */}
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Integrationen</div>
          <div className="settings-group">
            <GoogleSection />
          </div>
        </div>

        {/* Data & Backup */}
        <BackupSection />

        {/* Drive Naming */}
        <DriveNamingSection />

        {/* Security */}
        <SecuritySection />

      </div>
    </>
  );
}

// ─── Backup Section ────────────────────────────────────────────
function BackupSection() {
  const [exporting, setExporting]     = useState(false);
  const [exportingDrive, setExportingDrive] = useState(false);
  const [importing, setImporting]     = useState(false);
  const [mode, setMode]               = useState<"replace" | "merge">("replace");
  const [file, setFile]               = useState<File | null>(null);
  const [result, setResult]           = useState<{ ok: boolean; msg: string } | null>(null);
  const [confirm, setConfirm]         = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<{ connected: boolean }>("/api/google/status")
      .then(r => setGoogleConnected(r.data.connected)).catch(() => {});
  }, []);

  const doExport = async () => {
    setExporting(true);
    try {
      const res = await api.get("/api/export", { responseType: "blob" });
      const date = new Date().toISOString().slice(0, 10);
      const url  = URL.createObjectURL(res.data as Blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `application-pal-export-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setResult({ ok: false, msg: "Export fehlgeschlagen." });
    } finally {
      setExporting(false);
    }
  };

  const doExportToDrive = async () => {
    setExportingDrive(true); setResult(null);
    try {
      const res = await api.post<{ ok: boolean; fileName: string; fileUrl: string }>("/api/export/drive");
      setResult({ ok: true, msg: `Auf Google Drive gespeichert: ${res.data.fileName}` });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Google Drive Export fehlgeschlagen";
      setResult({ ok: false, msg });
    } finally {
      setExportingDrive(false);
    }
  };

  const doImport = async () => {
    if (!file) return;
    setImporting(true);
    setConfirm(false);
    setResult(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data?.meta?.app !== "application-pal" || data?.meta?.version !== 1) {
        setResult({ ok: false, msg: "Ungültige Export-Datei — falsches Format." });
        return;
      }
      const res = await api.post<{ ok: boolean; imported: Record<string, number> }>("/api/import", { mode, data });
      const imp = res.data.imported;
      setResult({ ok: true, msg: `Import erfolgreich: ${imp.applications} Bewerbungen, ${imp.documents} Dokumente, ${imp.userDocuments} Bibliotheks-Dokumente.` });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      // Reload page data after short delay
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      setResult({ ok: false, msg: "Import fehlgeschlagen — Datei prüfen." });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Database size={13} style={{ color: "var(--fg-3)" }} />
        <div className="eyebrow">Daten & Backup</div>
      </div>
      <div className="settings-group">

        {/* Export */}
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Export</div>
            <div className="settings-row-sub">Alle Daten als JSON-Backup herunterladen oder auf Google Drive speichern</div>
          </div>
          <div className="settings-row-right" style={{ gap: 8 }}>
            <button className="btn btn-secondary" style={{ fontSize: 12, gap: 6 }} onClick={doExport} disabled={exporting}>
              {exporting ? <Loader size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={12} />}
              Herunterladen
            </button>
            {googleConnected && (
              <button className="btn btn-secondary" style={{ fontSize: 12, gap: 6 }} onClick={doExportToDrive} disabled={exportingDrive}>
                {exportingDrive
                  ? <Loader size={12} style={{ animation: "spin 1s linear infinite" }} />
                  : <svg width="12" height="12" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>}
                Drive
              </button>
            )}
          </div>
        </div>

        {/* Import */}
        <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div className="settings-row-label">Import</div>
              <div className="settings-row-sub">JSON-Backup wiederherstellen</div>
            </div>
          </div>

          {/* Mode toggle */}
          <div style={{ display: "flex", gap: 6 }}>
            {(["replace", "merge"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} style={{
                padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${mode === m ? "var(--accent)" : "var(--border)"}`,
                background: mode === m ? "var(--accent-08)" : "transparent",
                color: mode === m ? "var(--accent)" : "var(--fg-3)",
                fontFamily: "var(--font-sans)"
              }}>
                {m === "replace" ? "Ersetzen" : "Zusammenführen"}
              </button>
            ))}
            <span style={{ fontSize: 11, color: "var(--fg-3)", alignSelf: "center" }}>
              {mode === "replace" ? "— löscht alle bestehenden Daten" : "— fügt hinzu / überschreibt"}
            </span>
          </div>

          {/* File picker + import button */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
              style={{ flex: 1, fontSize: 12, color: "var(--fg-2)" }}
            />
            <button
              className="btn btn-primary"
              style={{ fontSize: 12, gap: 6, flexShrink: 0 }}
              disabled={!file || importing}
              onClick={() => mode === "replace" ? setConfirm(true) : doImport()}
            >
              {importing
                ? <Loader size={12} style={{ animation: "spin 1s linear infinite" }} />
                : <Upload size={12} />}
              Importieren
            </button>
          </div>

          {/* Result message */}
          {result && (
            <div style={{
              padding: "8px 12px", borderRadius: 8, fontSize: 12,
              background: result.ok ? "rgba(52,211,153,0.1)" : "rgba(244,63,94,0.1)",
              border: `1px solid ${result.ok ? "#34d399" : "#f43f5e"}`,
              color: result.ok ? "#34d399" : "#f43f5e"
            }}>
              {result.ok ? "✓ " : "✗ "}{result.msg}
            </div>
          )}
        </div>

        {/* Docker hint */}
        <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <div className="settings-row-label" style={{ marginBottom: 6 }}>Direkter PostgreSQL-Dump</div>
          <div style={{ background: "var(--surface-3, var(--bg))", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-2)", lineHeight: 1.9 }}>
            <div style={{ color: "var(--fg-3)", marginBottom: 4, fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Backup</div>
            docker exec application-pal-db-1 pg_dump -U postgres application_pal {">"} backup.sql
            <div style={{ color: "var(--fg-3)", marginTop: 8, marginBottom: 4, fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Restore</div>
            docker exec -i application-pal-db-1 psql -U postgres application_pal {"<"} backup.sql
          </div>
        </div>

      </div>

      {/* Confirm dialog */}
      {confirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setConfirm(false)}>
          <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 14, padding: 28, width: 400, display: "flex", flexDirection: "column", gap: 16 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Daten ersetzen?</div>
            <div style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.6 }}>
              Alle bestehenden Bewerbungen, Dokumente und Profilangaben werden gelöscht und durch die Backup-Daten ersetzt. Diese Aktion kann nicht rückgängig gemacht werden.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setConfirm(false)}>Abbrechen</button>
              <button className="btn btn-primary" style={{ fontSize: 12, background: "#f43f5e", borderColor: "#f43f5e" }} onClick={doImport}>
                Ja, ersetzen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

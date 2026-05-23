import { useState, useEffect, useCallback, useRef } from "react";
import { Refresh, CheckCircle, WarningCircle, RefreshCircle, Link, LinkSlash, Download, Upload, Database, Shield, Key, LogOut, Trash, Folder, OpenNewWindow, Calendar, InfoCircle } from "iconoir-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
          <div className="settings-row-label">{t("settings.lmStudioUrl")}</div>
          <div className="settings-row-sub">{t("settings.lmStudioUrlSub")}</div>
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
              ? <RefreshCircle width={13} height={13} style={{ animation: "spin 1s linear infinite" }} />
              : <Refresh width={13} height={13} />}
          </button>
          {status === "ok"    && <CheckCircle width={14} height={14} style={{ color: "var(--green)", flexShrink: 0 }} />}
          {status === "error" && <WarningCircle width={14} height={14} style={{ color: "var(--red)", flexShrink: 0 }} />}
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row-label">{t("settings.model")}</div>
          <div className="settings-row-sub">
            {status === "error"
              ? t("settings.modelNotReachable")
              : status === "idle"
                ? t("settings.modelClickToLoad")
                : models.length === 0
                  ? t("settings.modelNoneLoaded")
                  : t("settings.modelAvailable", { count: models.length })}
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
  const { t } = useTranslation();
  const { ai, setAi } = useUiStore();
  const [show, setShow] = useState(false);

  return (
    <div className="settings-row">
      <div>
        <div className="settings-row-label">{t("settings.anthropicKey")}</div>
        <div className="settings-row-sub">{t("settings.anthropicKeySub")}</div>
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
          {show ? t("settings.hide") : t("settings.show")}
        </button>
      </div>
    </div>
  );
}

// ─── OpenAI section ───────────────────────────────────────────
function OpenAiSection() {
  const { t } = useTranslation();
  const { ai, setAi } = useUiStore();
  const [show, setShow] = useState(false);
  const OPENAI_MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"];

  return (
    <>
      <div className="settings-row">
        <div>
          <div className="settings-row-label">{t("settings.openaiKey")}</div>
          <div className="settings-row-sub">{t("settings.openaiKeySub")}</div>
        </div>
        <div className="settings-row-right" style={{ display: "flex", gap: 6 }}>
          <input
            type={show ? "text" : "password"}
            value={ai.openaiApiKey}
            onChange={(e) => setAi({ openaiApiKey: e.target.value })}
            placeholder="sk-…"
            style={{ ...INPUT_STYLE, width: 220, fontFamily: "var(--font-mono)", fontSize: 11 }}
          />
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 8px", flexShrink: 0 }} onClick={() => setShow(s => !s)}>
            {show ? t("settings.hide") : t("settings.show")}
          </button>
        </div>
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-row-label">{t("settings.model")}</div>
          <div className="settings-row-sub">{t("settings.openaiModelSub")}</div>
        </div>
        <div className="settings-row-right">
          <select
            value={ai.openaiModel}
            onChange={(e) => setAi({ openaiModel: e.target.value })}
            style={{ ...INPUT_STYLE, width: 220, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 11 }}
          >
            {OPENAI_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>
    </>
  );
}

// ─── Gemini section ───────────────────────────────────────────
function GeminiSection() {
  const { t } = useTranslation();
  const { ai, setAi } = useUiStore();
  const [show, setShow] = useState(false);
  const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro", "gemini-1.5-flash"];

  return (
    <>
      <div className="settings-row">
        <div>
          <div className="settings-row-label">{t("settings.geminiKey")}</div>
          <div className="settings-row-sub">{t("settings.geminiKeySub")}</div>
        </div>
        <div className="settings-row-right" style={{ display: "flex", gap: 6 }}>
          <input
            type={show ? "text" : "password"}
            value={ai.geminiApiKey}
            onChange={(e) => setAi({ geminiApiKey: e.target.value })}
            placeholder="AIza…"
            style={{ ...INPUT_STYLE, width: 220, fontFamily: "var(--font-mono)", fontSize: 11 }}
          />
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 8px", flexShrink: 0 }} onClick={() => setShow(s => !s)}>
            {show ? t("settings.hide") : t("settings.show")}
          </button>
        </div>
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-row-label">{t("settings.model")}</div>
          <div className="settings-row-sub">{t("settings.geminiModelSub")}</div>
        </div>
        <div className="settings-row-right">
          <select
            value={ai.geminiModel}
            onChange={(e) => setAi({ geminiModel: e.target.value })}
            style={{ ...INPUT_STYLE, width: 220, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 11 }}
          >
            {GEMINI_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>
    </>
  );
}

// ─── OpenRouter section ───────────────────────────────────────
function OpenRouterSection() {
  const { t } = useTranslation();
  const { ai, setAi } = useUiStore();
  const [show, setShow] = useState(false);

  return (
    <>
      <div className="settings-row">
        <div>
          <div className="settings-row-label">{t("settings.openrouterKey")}</div>
          <div className="settings-row-sub">{t("settings.openrouterKeySub")}</div>
        </div>
        <div className="settings-row-right" style={{ display: "flex", gap: 6 }}>
          <input
            type={show ? "text" : "password"}
            value={ai.openrouterApiKey}
            onChange={(e) => setAi({ openrouterApiKey: e.target.value })}
            placeholder="sk-or-…"
            style={{ ...INPUT_STYLE, width: 220, fontFamily: "var(--font-mono)", fontSize: 11 }}
          />
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 8px", flexShrink: 0 }} onClick={() => setShow(s => !s)}>
            {show ? t("settings.hide") : t("settings.show")}
          </button>
        </div>
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-row-label">{t("settings.model")}</div>
          <div className="settings-row-sub">{t("settings.openrouterModelSub")}</div>
        </div>
        <div className="settings-row-right">
          <input
            value={ai.openrouterModel}
            onChange={(e) => setAi({ openrouterModel: e.target.value })}
            placeholder={t("settings.openrouterModelPlaceholder")}
            style={{ ...INPUT_STYLE, width: 220, fontFamily: "var(--font-mono)", fontSize: 11 }}
          />
        </div>
      </div>
    </>
  );
}

// ─── Ollama section ───────────────────────────────────────────
function OllamaSection() {
  const { t } = useTranslation();
  const { ai, setAi } = useUiStore();
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");

  const fetchModels = async (url: string) => {
    setStatus("loading");
    try {
      const res = await api.get<{ models: string[] }>(`/api/ollama/models?url=${encodeURIComponent(url)}`);
      const list = res.data.models;
      setModels(list);
      setStatus(list.length > 0 ? "ok" : "error");
      if (list.length > 0 && !ai.ollamaModel) {
        setAi({ ollamaModel: list[0] });
      }
    } catch {
      setStatus("error");
      setModels([]);
    }
  };

  useEffect(() => {
    if (ai.provider === "ollama") {
      fetchModels(ai.ollamaUrl || "http://localhost:11434");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.provider]);

  return (
    <>
      <div className="settings-row">
        <div>
          <div className="settings-row-label">{t("settings.ollamaUrl")}</div>
          <div className="settings-row-sub">{t("settings.ollamaUrlSub")}</div>
        </div>
        <div className="settings-row-right" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            value={ai.ollamaUrl}
            onChange={(e) => setAi({ ollamaUrl: e.target.value })}
            placeholder="http://localhost:11434"
            style={{ ...INPUT_STYLE, width: 200, fontFamily: "var(--font-mono)", fontSize: 11 }}
          />
          <button
            className="btn btn-secondary btn-icon"
            onClick={() => fetchModels(ai.ollamaUrl || "http://localhost:11434")}
            title="Test connection"
          >
            {status === "loading"
              ? <RefreshCircle width={13} height={13} style={{ animation: "spin 1s linear infinite" }} />
              : <Refresh width={13} height={13} />}
          </button>
          {status === "ok"    && <CheckCircle width={14} height={14} style={{ color: "var(--green)", flexShrink: 0 }} />}
          {status === "error" && <WarningCircle width={14} height={14} style={{ color: "var(--red)", flexShrink: 0 }} />}
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row-label">{t("settings.model")}</div>
          <div className="settings-row-sub">
            {status === "error"
              ? t("settings.modelNotReachable")
              : status === "idle"
                ? t("settings.modelClickToLoad")
                : models.length === 0
                  ? t("settings.modelNoneLoaded")
                  : t("settings.modelAvailable", { count: models.length })}
          </div>
        </div>
        <div className="settings-row-right">
          {models.length > 0 ? (
            <select
              value={ai.ollamaModel}
              onChange={(e) => setAi({ ollamaModel: e.target.value })}
              style={{ ...INPUT_STYLE, width: 260, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 11 }}
            >
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input
              value={ai.ollamaModel}
              onChange={(e) => setAi({ ollamaModel: e.target.value })}
              placeholder="e.g. llama3.2"
              style={{ ...INPUT_STYLE, width: 260, fontFamily: "var(--font-mono)", fontSize: 11 }}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ─── Provider selector pill ───────────────────────────────────
function ProviderPill({ value, label, active, onClick, color, recommended }: {
  value: AiProvider; label: string; active: boolean; onClick: () => void; color?: string; recommended?: string;
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
        transition: "all 0.12s ease",
        position: "relative",
      }}
    >
      {color && (
        <span style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }} />
      )}
      {label}
      {recommended && (
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          color: "#10b981",
          background: "rgba(16,185,129,0.12)",
          border: "1px solid rgba(16,185,129,0.3)",
          borderRadius: 4,
          padding: "1px 5px",
          letterSpacing: "0.02em",
          lineHeight: 1.4,
        }}>
          {recommended}
        </span>
      )}
    </button>
  );
}

// ─── Google Calendar sub-section (inside GoogleSection) ──────
interface GCalItem { id: string; summary: string; backgroundColor?: string; primary?: boolean }

function CalendarSubSection({ onReconnect }: { onReconnect: () => void }) {
  const { t } = useTranslation();
  const [scopeStatus, setScopeStatus] = useState<"loading" | "ok" | "missing">("loading");
  const [calendars, setCalendars]     = useState<GCalItem[]>([]);
  const [calId, setCalId]             = useState("");
  const [saved, setSaved]             = useState(false);
  const [loadingCals, setLoadingCals] = useState(false);

  // Check scope + load saved calId
  useEffect(() => {
    api.get<{ connected: boolean; hasCalendarScope: boolean }>("/api/google/calendar/status")
      .then(r => {
        setScopeStatus(r.data.hasCalendarScope ? "ok" : "missing");
      })
      .catch(() => setScopeStatus("missing"));
    api.get<{ googleCalendarId?: string | null }>("/api/profile")
      .then(r => setCalId(r.data.googleCalendarId ?? ""))
      .catch(() => {});
  }, []);

  // Load calendar list once scope is confirmed
  useEffect(() => {
    if (scopeStatus !== "ok") return;
    setLoadingCals(true);
    api.get<GCalItem[]>("/api/google/calendar/list")
      .then(r => setCalendars(r.data))
      .catch(() => {})
      .finally(() => setLoadingCals(false));
  }, [scopeStatus]);

  const saveCalId = async (id: string) => {
    setCalId(id);
    await api.patch("/api/profile", { googleCalendarId: id || null }).catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Calendar width={12} height={12} style={{ color: "#a855f7", flexShrink: 0 }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {t("settings.calendarTitle")}
        </div>
        {saved && (
          <span style={{ fontSize: 10, color: "#4ade80", marginLeft: "auto" }}>
            <CheckCircle width={10} height={10} /> {t("settings.calendarSaved")}
          </span>
        )}
      </div>

      {scopeStatus === "loading" && (
        <div style={{ fontSize: 12, color: "var(--fg-3)" }}>
          <RefreshCircle width={12} height={12} style={{ animation: "spin 1s linear infinite" }} /> {t("settings.calendarChecking")}
        </div>
      )}

      {scopeStatus === "missing" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Status badge */}
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "10px 12px", borderRadius: 8,
            background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)",
          }}>
            <InfoCircle width={14} height={14} style={{ color: "#fbbf24", flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-1)", marginBottom: 4 }}>
                {t("settings.calendarNoScope")}
              </div>
              <div style={{ fontSize: 11, color: "var(--fg-2)", lineHeight: 1.6 }}>
                Dein aktueller Google-Token hat keinen <code style={{ fontSize: 10, background: "var(--surface-2)", borderRadius: 3, padding: "1px 4px" }}>calendar.readonly</code>-Scope.
                Trenne die Verbindung und verbinde Google erneut, um den Kalender-Zugriff zu aktivieren.
              </div>
            </div>
          </div>

          {/* Setup steps */}
          <div style={{
            padding: "10px 12px", borderRadius: 8,
            background: "var(--surface-2)", border: "1px solid var(--border)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-2)", marginBottom: 8 }}>
              Einmalige Einrichtung (Google Cloud Console)
            </div>
            <ol style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                <>
                  <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                    Google Calendar API aktivieren
                  </a>{" "}
                  <span style={{ color: "var(--fg-3)" }}>(APIs &amp; Services → Bibliothek → „Google Calendar API")</span>
                </>,
                <>
                  OAuth-Zustimmungsbildschirm → <strong style={{ color: "var(--fg-2)" }}>Bereiche hinzufügen</strong>:{" "}
                  <code style={{ fontSize: 10, background: "var(--surface)", borderRadius: 3, padding: "1px 4px" }}>
                    .../auth/calendar.readonly
                  </code>
                </>,
                <>
                  Wenn App im <strong style={{ color: "var(--fg-2)" }}>Test-Modus</strong>: Deine E-Mail als Testnutzer eintragen
                </>,
                <>
                  Unten auf <strong style={{ color: "var(--fg-2)" }}>„Google neu verbinden"</strong> klicken → Neu anmelden
                </>,
              ].map((step, i) => (
                <li key={i} style={{ fontSize: 11, color: "var(--fg-2)", lineHeight: 1.55 }}>{step}</li>
              ))}
            </ol>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" style={{ fontSize: 12, gap: 5 }} onClick={onReconnect}>
              <Link width={11} height={11} /> {t("settings.reconnectGoogle")}
            </button>
            <a
              href="https://console.cloud.google.com"
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost"
              style={{ fontSize: 11, textDecoration: "none" }}
            >
              Google Cloud Console ↗
            </a>
          </div>
        </div>
      )}

      {scopeStatus === "ok" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--fg-3)", lineHeight: 1.5 }}>
            {t("settings.calendarSelectHint")}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {loadingCals ? (
              <div style={{ fontSize: 12, color: "var(--fg-3)", display: "flex", alignItems: "center", gap: 6 }}>
                <RefreshCircle width={12} height={12} style={{ animation: "spin 1s linear infinite" }} /> {t("settings.calendarLoading")}
              </div>
            ) : (
              <select
                value={calId}
                onChange={e => saveCalId(e.target.value)}
                style={{
                  flex: 1, fontSize: 12, padding: "6px 10px",
                  borderRadius: 8, border: "1px solid var(--border)",
                  background: "var(--surface)", color: calId ? "var(--fg-1)" : "var(--fg-3)",
                  cursor: "pointer", fontFamily: "var(--font-sans)",
                }}
              >
                <option value="">{t("settings.calendarPrimary")}</option>
                {calendars.map(cal => (
                  <option key={cal.id} value={cal.id}>
                    {cal.primary ? `✦ ${cal.summary} (${t("settings.calendarPrimaryLabel")})` : cal.summary}
                  </option>
                ))}
              </select>
            )}
            {calId && !loadingCals && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: "4px 8px", whiteSpace: "nowrap" }}
                onClick={() => saveCalId("")}
              >
                {t("settings.calendarReset")}
              </button>
            )}
          </div>
          {calId && (
            <div style={{ fontSize: 10, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
              ID: {calId}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Google OAuth section ─────────────────────────────────────
function GoogleSection() {
  const { t } = useTranslation();
  // driveApplicationsFolderId now lives in user_profile (per-user), not Zustand
  const [driveApplicationsFolderId, setDriveApplicationsFolderIdState] = useState("");
  const [status, setStatus] = useState<"loading" | "connected" | "disconnected">("loading");
  const [folderInput, setFolderInput] = useState("");
  const [folderInfo, setFolderInfo]   = useState<{ id: string; name: string; url: string } | null>(null);
  const [folderErr, setFolderErr]     = useState<string | null>(null);
  const [checkingFolder, setCheckingFolder] = useState(false);

  const check = useCallback(() => {
    api.get<{ connected: boolean }>("/api/google/status")
      .then((r) => setStatus(r.data.connected ? "connected" : "disconnected"))
      .catch(() => setStatus("disconnected"));
  }, []);

  useEffect(() => { check(); }, [check]);

  // Load driveApplicationsFolderId from user profile (per-user, server-side)
  useEffect(() => {
    if (status !== "connected") return;
    api.get<{ driveApplicationsFolderId?: string | null }>("/api/profile")
      .then(r => {
        const savedId = r.data.driveApplicationsFolderId ?? "";
        setDriveApplicationsFolderIdState(savedId);
        setFolderInput(savedId);
        if (savedId) {
          api.get<{ id: string; name: string; url: string }>(`/api/drive/folder-info?folderId=${savedId}`)
            .then(fr => setFolderInfo(fr.data))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [status]);

  // Persist to profile
  const saveFolderIdToProfile = async (id: string) => {
    setDriveApplicationsFolderIdState(id);
    await api.patch("/api/profile", { driveApplicationsFolderId: id || null }).catch(() => {});
  };

  /** Extract folder ID from a Google Drive URL or treat input as raw ID */
  const parseFolderId = (val: string): string => {
    const m = val.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : val.trim();
  };

  const validateFolder = async () => {
    const id = parseFolderId(folderInput);
    if (!id) { setFolderInfo(null); await saveFolderIdToProfile(""); return; }
    setCheckingFolder(true); setFolderErr(null);
    try {
      const r = await api.get<{ id: string; name: string; url: string }>(`/api/drive/folder-info?folderId=${id}`);
      setFolderInfo(r.data);
      await saveFolderIdToProfile(r.data.id);
      setFolderInput(r.data.id);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Ordner nicht gefunden";
      setFolderErr(msg); setFolderInfo(null);
    } finally { setCheckingFolder(false); }
  };

  const clearFolder = async () => {
    setFolderInput(""); setFolderInfo(null); setFolderErr(null);
    await saveFolderIdToProfile("");
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
            <span style={{ fontSize: 14 }}>G</span> {t("settings.googleDrive")}
          </div>
          <div className="settings-row-sub">
            {status === "connected" ? t("settings.googleConnected") : t("settings.googleDisconnected")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {status === "loading" && <RefreshCircle width={14} height={14} style={{ animation: "spin 1s linear infinite", color: "var(--fg-3)" }} />}
          {status === "connected" && (
            <>
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--green)", fontWeight: 600 }}>
                <CheckCircle width={13} height={13} /> {t("settings.connected")}
              </span>
              <button className="btn btn-ghost" style={{ fontSize: 11, gap: 4, padding: "4px 8px" }} onClick={disconnect}>
                <LinkSlash width={11} height={11} /> {t("settings.disconnect")}
              </button>
            </>
          )}
          {status === "disconnected" && (
            <button className="btn btn-primary" style={{ fontSize: 12, gap: 5 }} onClick={connect}>
              <Link width={12} height={12} /> {t("settings.connectGoogle")}
            </button>
          )}
        </div>
      </div>

      {/* Folder picker — only when connected */}
      {status === "connected" && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            {t("settings.folderSection")}
          </div>
          <div style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 10, lineHeight: 1.5 }}>
            {t("settings.folderHint")}
          </div>

          {/* Current folder display */}
          {folderInfo ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.25)" }}>
              <Folder width={15} height={15} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)" }}>{folderInfo.name}</div>
                <div style={{ fontSize: 10, color: "var(--fg-3)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folderInfo.id}</div>
              </div>
              <a href={folderInfo.url} target="_blank" rel="noreferrer"
                style={{ color: "var(--accent)", display: "flex", flexShrink: 0 }} title="In Drive öffnen">
                <OpenNewWindow width={12} height={12} />
              </a>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={clearFolder}>
                {t("settings.changeFolder")}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <div className="field" style={{ flex: 1, margin: 0 }}>
                <input
                  value={folderInput}
                  onChange={e => setFolderInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && validateFolder()}
                  placeholder={t("settings.folderUrlPlaceholder")}
                  style={{ fontSize: 12 }}
                />
              </div>
              <button className="btn btn-secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}
                disabled={checkingFolder || !folderInput.trim()} onClick={validateFolder}>
                {checkingFolder ? <RefreshCircle width={11} height={11} style={{ animation: "spin 1s linear infinite" }} /> : t("settings.confirmFolder")}
              </button>
            </div>
          )}
          {folderErr && <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>{folderErr}</div>}
          {!folderInfo && !folderInput && (
            <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 6 }}>
              {t("settings.folderDefault")}
            </div>
          )}
        </div>
      )}

      {/* Google Calendar — only when connected */}
      {status === "connected" && (
        <CalendarSubSection onReconnect={connect} />
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
  const { t } = useTranslation();
  const { driveNameFolder, setDriveNameFolder, driveNameDoc, setDriveNameDoc } = useUiStore();
  const [folder, setFolder] = useState(driveNameFolder);
  const [doc, setDoc]       = useState(driveNameDoc);

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Folder width={13} height={13} style={{ color: "var(--fg-3)" }} />
        <div className="eyebrow">{t("settings.driveNaming")}</div>
      </div>
      <div className="settings-group">
        <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
          <div style={{ fontSize: 12, color: "var(--fg-3)", lineHeight: 1.6 }}>
            {t("settings.driveNamingHint")}{" "}
            <span style={{ color: "var(--fg-2)" }}>
              {t("settings.driveNamingPlaceholders")} {PLACEHOLDERS.map(p => (
                <code key={p} style={{ fontSize: 10, background: "var(--surface-2)", borderRadius: 3, padding: "1px 4px", margin: "0 2px" }}>{p}</code>
              ))}
            </span>
          </div>

          {/* Folder rule */}
          <div className="field" style={{ margin: 0 }}>
            <label>{t("settings.folderRule")}</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={folder} onChange={e => setFolder(e.target.value)} onBlur={() => setDriveNameFolder(folder)}
                placeholder={DEFAULT_FOLDER_RULE} style={{ flex: 1 }} />
              <button className="btn btn-ghost" style={{ fontSize: 11, whiteSpace: "nowrap" }}
                onClick={() => { setFolder(DEFAULT_FOLDER_RULE); setDriveNameFolder(DEFAULT_FOLDER_RULE); }}>
                {t("settings.reset")}
              </button>
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 4 }}>
              {t("settings.previewLabel")} <em style={{ color: "var(--fg-2)" }}>{previewRule(folder || DEFAULT_FOLDER_RULE)}</em>
            </div>
          </div>

          {/* Doc rule */}
          <div className="field" style={{ margin: 0 }}>
            <label>{t("settings.docRule")}</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={doc} onChange={e => setDoc(e.target.value)} onBlur={() => setDriveNameDoc(doc)}
                placeholder={DEFAULT_DOC_RULE} style={{ flex: 1 }} />
              <button className="btn btn-ghost" style={{ fontSize: 11, whiteSpace: "nowrap" }}
                onClick={() => { setDoc(DEFAULT_DOC_RULE); setDriveNameDoc(DEFAULT_DOC_RULE); }}>
                {t("settings.reset")}
              </button>
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 4 }}>
              {t("settings.previewLabel")} <em style={{ color: "var(--fg-2)" }}>{previewRule(doc || DEFAULT_DOC_RULE)}</em>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Google Calendar Section ──────────────────────────────────
function CalendarSection() {
  const { t } = useTranslation();
  const [calId, setCalId] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<{ googleCalendarId?: string | null }>("/api/profile")
      .then(r => setCalId(r.data.googleCalendarId ?? ""))
      .catch(() => {});
  }, []);

  const save = async () => {
    await api.patch("/api/profile", { googleCalendarId: calId.trim() || null }).catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Calendar width={13} height={13} />
        <div className="eyebrow">{t("settings.calendarTitle")}</div>
      </div>
      <div className="settings-group">
        <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          <div style={{ fontSize: 12, color: "var(--fg-3)", lineHeight: 1.6 }}>
            {t("settings.calendarIdSub")}
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>{t("settings.calendarId")}</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={calId} onChange={e => setCalId(e.target.value)} onBlur={save}
                placeholder={t("settings.calendarIdPlaceholder")}
                style={{ flex: 1 }} />
              {saved && <span style={{ fontSize: 11, color: "#4ade80", whiteSpace: "nowrap" }}>✓ {t("settings.calendarSavedLabel")}</span>}
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--fg-3)", lineHeight: 1.6 }}>
            {t("settings.calendarIdHint")}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Invite Section ───────────────────────────────────────────
interface InviteRow {
  id: string;
  token: string;
  email: string | null;
  used: boolean;
  expiresAt: string | null;
  createdAt: string;
}

function InviteSection() {
  const { t } = useTranslation();
  const [invites, setInvites]       = useState<InviteRow[]>([]);
  const [email, setEmail]           = useState("");
  const [days, setDays]             = useState(7);
  const [creating, setCreating]     = useState(false);
  const [newToken, setNewToken]     = useState<string | null>(null);
  const [copied, setCopied]         = useState(false);

  const load = useCallback(() => {
    api.get<InviteRow[]>("/api/invites").then(r => setInvites(r.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setCreating(true);
    try {
      const r = await api.post<InviteRow>("/api/invites", { email: email.trim() || undefined, expiresInDays: days });
      setNewToken(r.data.token);
      setEmail("");
      load();
    } finally { setCreating(false); }
  };

  const remove = async (id: string) => {
    await api.delete(`/api/invites/${id}`).catch(() => {});
    load();
  };

  const inviteUrl = newToken
    ? `${window.location.origin}/setup?invite=${newToken}`
    : null;

  const copyLink = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Key width={13} height={13} style={{ color: "var(--fg-3)" }} />
        <div className="eyebrow">{t("settings.invites")}</div>
      </div>
      <div className="settings-group">
        <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
          <div style={{ fontSize: 12, color: "var(--fg-3)", lineHeight: 1.6 }}>
            {t("settings.invitesHint")}
          </div>

          {/* Create form */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t("settings.inviteEmailPlaceholder")}
              style={{ flex: 1, fontSize: 12, minWidth: 200 }}
              className="field"
            />
            <select
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              style={{ fontSize: 12, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--fg-1)", fontFamily: "var(--font-sans)" }}
            >
              {[1, 3, 7, 14, 30].map(d => (
                <option key={d} value={d}>{t("settings.inviteValidDays", { count: d })}</option>
              ))}
            </select>
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={create} disabled={creating}>
              {creating ? <RefreshCircle width={12} height={12} style={{ animation: "spin 1s linear infinite" }} /> : <Link width={12} height={12} />}
              {" "}{t("settings.inviteCreate")}
            </button>
          </div>

          {/* New invite link */}
          {inviteUrl && (
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--green)" }}>{t("settings.inviteCreated")}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-2)", wordBreak: "break-all" }}>
                {inviteUrl}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={copyLink}>
                  {copied ? t("settings.inviteCopied") : t("settings.inviteCopy")}
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setNewToken(null)}>
                  {t("buttons.close")}
                </button>
              </div>
            </div>
          )}

          {/* Existing invites */}
          {invites.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                {t("settings.invitePending")}
              </div>
              {invites.map(inv => (
                <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 6, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: inv.used ? "var(--fg-3)" : "var(--fg-1)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {inv.token.slice(0, 12)}…
                    </div>
                    <div style={{ fontSize: 10, color: "var(--fg-3)" }}>
                      {inv.email ? inv.email : t("settings.inviteAnyEmail")}
                      {" · "}
                      {inv.used ? t("settings.inviteUsed") : inv.expiresAt ? t("settings.inviteExpires", { date: new Date(inv.expiresAt).toLocaleDateString() }) : t("settings.inviteNoExpiry")}
                    </div>
                  </div>
                  {inv.used && <span style={{ fontSize: 10, color: "var(--fg-3)" }}>{t("settings.inviteRedeemed")}</span>}
                  {!inv.used && (
                    <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 6px" }} onClick={() => remove(inv.id)}>
                      <Trash width={10} height={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Security Section ─────────────────────────────────────────
type PasskeyInfo = { id: string; deviceName: string | null; createdAt: string };

const SESSION_TIMEOUT_VALUES = ["15m", "1h", "6h", "24h", "7d", "30d"] as const;

function SecuritySection() {
  const { t } = useTranslation();
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
  const [sessionTimeout, setSessionTimeout] = useState("15m");
  const [timeoutSaved, setTimeoutSaved] = useState(false);

  useEffect(() => {
    api.get<{ sessionTimeout?: string | null }>("/api/profile")
      .then(r => setSessionTimeout(r.data.sessionTimeout ?? "15m"))
      .catch(() => {});
  }, []);

  const saveTimeout = async (val: string) => {
    setSessionTimeout(val);
    await api.patch("/api/profile", { sessionTimeout: val }).catch(() => {});
    setTimeoutSaved(true);
    setTimeout(() => setTimeoutSaved(false), 1500);
  };

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
      setPasskeyMsg(t("settings.passkeyAdded")); setDeviceName("");
      await loadCreds();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPasskeyMsg(msg ?? t("settings.passkeyError"));
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
      setPwMsg(t("settings.passwordChanged")); setCurrPw(""); setNewPw(""); setChangePw(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPwMsg(msg ?? t("settings.passwordError"));
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
        <Shield width={13} height={13} style={{ color: "var(--fg-3)" }} />
        <div className="eyebrow">{t("settings.security")}</div>
      </div>
      <div className="settings-group">

        {/* Session timeout */}
        <div className="settings-row">
          <div style={{ flex: 1 }}>
            <div className="settings-row-label">{t("settings.sessionDuration")}</div>
            <div className="settings-row-sub">{t("settings.sessionDurationSub")}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select value={sessionTimeout} onChange={e => saveTimeout(e.target.value)}
              style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--fg-1)", cursor: "pointer" }}>
              {SESSION_TIMEOUT_VALUES.map(v => <option key={v} value={v}>{t(`settings.sessionTimeout${v}`)}</option>)}
            </select>
            {timeoutSaved && <span style={{ fontSize: 11, color: "#4ade80" }}>✓</span>}
          </div>
        </div>

        {/* Current user */}
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t("settings.account")}</div>
            <div className="settings-row-sub">{user?.email}</div>
          </div>
          <button className="btn btn-secondary" style={{ gap: 6, fontSize: 12 }} onClick={handleLogout}>
            <LogOut width={12} height={12} /> {t("user.logout")}
          </button>
        </div>

        {/* Change password */}
        <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="settings-row-label">{t("settings.password")}</div>
              <div className="settings-row-sub">{t("settings.passwordSub")}</div>
            </div>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setChangePw(v => !v)}>
              {changePw ? t("settings.passwordCancel") : t("settings.passwordChange")}
            </button>
          </div>
          {changePw && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="field" style={{ margin: 0 }}>
                <label>{t("settings.currentPassword")}</label>
                <input type="password" value={currPw} onChange={e => setCurrPw(e.target.value)} placeholder="••••••••" />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>{t("settings.newPassword")}</label>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder={t("settings.newPasswordPlaceholder")} />
              </div>
              <button className="btn btn-primary" style={{ fontSize: 12, alignSelf: "flex-end" }} onClick={changePassword}>{t("buttons.save")}</button>
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
                  <Key width={12} height={12} /> {t("settings.passkeys")}
                </div>
                <div className="settings-row-sub">{t("settings.passkeysSub")}</div>
              </div>
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setPasskeyMsg("")}>
                {t("settings.passkeyAdd")}
              </button>
            </div>

            {/* Add passkey inline */}
            <div style={{ display: "flex", gap: 8 }}>
              <div className="field" style={{ flex: 1, margin: 0 }}>
                <label>{t("settings.passkeyDeviceName")}</label>
                <input value={deviceName} onChange={e => setDeviceName(e.target.value)} placeholder={t("settings.passkeyDevicePlaceholder")} />
              </div>
              <button className="btn btn-primary" style={{ fontSize: 12, alignSelf: "flex-end" }} disabled={addingPasskey} onClick={addPasskey}>
                {addingPasskey ? t("settings.passkeyRegistering") : t("settings.passkeyRegister")}
              </button>
            </div>
            {passkeyMsg && <div style={{ fontSize: 12, color: passkeyMsg.includes("✓") ? "#34d399" : "#f87171" }}>{passkeyMsg}</div>}

            {/* Registered passkeys list */}
            {creds.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {creds.map(cr => (
                  <div key={cr.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-1)" }}>{cr.deviceName ?? t("settings.passkeyUnknown")}</div>
                      <div style={{ fontSize: 11, color: "var(--fg-3)" }}>{t("settings.passkeyAddedOn")} {new Date(cr.createdAt).toLocaleDateString()}</div>
                    </div>
                    <button className="btn btn-ghost btn-icon" onClick={() => deleteCred(cr.id)} title="Entfernen"><Trash width={12} height={12} /></button>
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
  const { t } = useTranslation();
  const { theme, setTheme, accent, setAccent, density, setDensity, cardVariant, setCardVariant, ai, setAi } = useUiStore();

  return (
    <>
      <Topbar title={t("settings.title")} />
      <div className="page-content" style={{ maxWidth: 680 }}>

        {/* Appearance */}
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>{t("settings.appearance")}</div>
          <div className="settings-group">
            <div className="settings-row">
              <div>
                <div className="settings-row-label">{t("settings.theme")}</div>
                <div className="settings-row-sub">{t("settings.themeSub")}</div>
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
                <div className="settings-row-label">{t("settings.accentColor")}</div>
                <div className="settings-row-sub">{t("settings.accentColorSub")}</div>
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
                <div className="settings-row-label">{t("settings.density")}</div>
                <div className="settings-row-sub">{t("settings.densitySub")}</div>
              </div>
              <div className="settings-row-right">
                <div className="theme-toggle">
                  <button className={density === "high" ? "active" : ""} onClick={() => setDensity("high")}>{t("settings.densityHigh")}</button>
                  <button className={density === "low"  ? "active" : ""} onClick={() => setDensity("low")}>{t("settings.densityLow")}</button>
                </div>
              </div>
            </div>
            <div className="settings-row">
              <div>
                <div className="settings-row-label">{t("settings.cardStyle")}</div>
                <div className="settings-row-sub">{t("settings.cardStyleSub")}</div>
              </div>
              <div className="settings-row-right">
                <select
                  value={cardVariant}
                  onChange={(e) => setCardVariant(e.target.value as CardVariant)}
                  style={{ ...INPUT_STYLE, width: 160, cursor: "pointer" }}
                >
                  <option value="rich">{t("settings.cardRich")}</option>
                  <option value="compact">{t("settings.cardCompact")}</option>
                  <option value="minimal">{t("settings.cardMinimal")}</option>
                  <option value="editorial">{t("settings.cardEditorial")}</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* AI Integration */}
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>{t("settings.ai")}</div>
          <div style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 14 }}>
            {t("settings.aiSub")}
          </div>

          {/* Provider selector — two rows */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <ProviderPill value="none"        label={t("settings.aiNone")}        active={ai.provider === "none"}        onClick={() => setAi({ provider: "none" })} />
            <ProviderPill value="lm-studio"   label={t("settings.aiLmStudio")}    color="#10b981" active={ai.provider === "lm-studio"}   onClick={() => setAi({ provider: "lm-studio" })}  recommended={t("settings.recommended")} />
            <ProviderPill value="ollama"      label={t("settings.aiOllama")}      color="#e05d44" active={ai.provider === "ollama"}      onClick={() => setAi({ provider: "ollama" })} />
            <ProviderPill value="anthropic"   label={t("settings.aiAnthropic")}   color="#f59e0b" active={ai.provider === "anthropic"}   onClick={() => setAi({ provider: "anthropic" })} />
            <ProviderPill value="openai"      label={t("settings.aiOpenAI")}      color="#74aa9c" active={ai.provider === "openai"}      onClick={() => setAi({ provider: "openai" })} />
            <ProviderPill value="gemini"      label={t("settings.aiGemini")}      color="#4285f4" active={ai.provider === "gemini"}      onClick={() => setAi({ provider: "gemini" })} />
            <ProviderPill value="openrouter"  label={t("settings.aiOpenRouter")}  color="#a855f7" active={ai.provider === "openrouter"}  onClick={() => setAi({ provider: "openrouter" })} />
          </div>

          {ai.provider !== "none" && (
            <div className="settings-group">
              {ai.provider === "lm-studio"  && <LmStudioSection />}
              {ai.provider === "ollama"     && <OllamaSection />}
              {ai.provider === "anthropic"  && <AnthropicSection />}
              {ai.provider === "openai"     && <OpenAiSection />}
              {ai.provider === "gemini"     && <GeminiSection />}
              {ai.provider === "openrouter" && <OpenRouterSection />}
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
              {t("settings.aiNoProvider")}
            </div>
          )}
        </div>

        {/* Integrations */}
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>{t("settings.integrations")}</div>
          <div className="settings-group">
            <GoogleSection />
          </div>
        </div>

        {/* Data & Backup */}
        <BackupSection />

        {/* Drive Naming */}
        <DriveNamingSection />

        {/* Invite management */}
        <InviteSection />

        {/* Security */}
        <SecuritySection />

      </div>
    </>
  );
}

// ─── Backup Section ────────────────────────────────────────────
function BackupSection() {
  const { t } = useTranslation();
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
      setResult({ ok: false, msg: t("settings.exportFailed") });
    } finally {
      setExporting(false);
    }
  };

  const doExportToDrive = async () => {
    setExportingDrive(true); setResult(null);
    try {
      const res = await api.post<{ ok: boolean; fileName: string; fileUrl: string }>("/api/export/drive");
      setResult({ ok: true, msg: t("settings.savedToDrive", { fileName: res.data.fileName }) });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t("settings.exportFailed");
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
        setResult({ ok: false, msg: t("settings.importInvalidFile") });
        return;
      }
      const res = await api.post<{ ok: boolean; imported: Record<string, number> }>("/api/import", { mode, data });
      const imp = res.data.imported;
      setResult({ ok: true, msg: t("settings.importSuccess", { applications: imp.applications, documents: imp.documents, userDocuments: imp.userDocuments }) });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      // Reload page data after short delay
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      setResult({ ok: false, msg: t("settings.importFailed") });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Database width={13} height={13} style={{ color: "var(--fg-3)" }} />
        <div className="eyebrow">{t("settings.backup")}</div>
      </div>
      <div className="settings-group">

        {/* Export */}
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t("settings.export")}</div>
            <div className="settings-row-sub">{t("settings.exportSub")}</div>
          </div>
          <div className="settings-row-right" style={{ gap: 8 }}>
            <button className="btn btn-secondary" style={{ fontSize: 12, gap: 6 }} onClick={doExport} disabled={exporting}>
              {exporting ? <RefreshCircle width={12} height={12} style={{ animation: "spin 1s linear infinite" }} /> : <Download width={12} height={12} />}
              {t("settings.download")}
            </button>
            {googleConnected && (
              <button className="btn btn-secondary" style={{ fontSize: 12, gap: 6 }} onClick={doExportToDrive} disabled={exportingDrive}>
                {exportingDrive
                  ? <RefreshCircle width={12} height={12} style={{ animation: "spin 1s linear infinite" }} />
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
              <div className="settings-row-label">{t("settings.importLabel")}</div>
              <div className="settings-row-sub">{t("settings.importSub")}</div>
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
                {m === "replace" ? t("settings.replace") : t("settings.merge")}
              </button>
            ))}
            <span style={{ fontSize: 11, color: "var(--fg-3)", alignSelf: "center" }}>
              {mode === "replace" ? t("settings.replaceHint") : t("settings.mergeHint")}
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
                ? <RefreshCircle width={12} height={12} style={{ animation: "spin 1s linear infinite" }} />
                : <Upload width={12} height={12} />}
              {t("settings.importBtn")}
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
          <div className="settings-row-label" style={{ marginBottom: 6 }}>{t("settings.pgDump")}</div>
          <div style={{ background: "var(--surface-3, var(--bg))", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-2)", lineHeight: 1.9 }}>
            <div style={{ color: "var(--fg-3)", marginBottom: 4, fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t("settings.pgDumpBackup")}</div>
            docker exec application-pal-db-1 pg_dump -U postgres application_pal {">"} backup.sql
            <div style={{ color: "var(--fg-3)", marginTop: 8, marginBottom: 4, fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>{t("settings.pgDumpRestore")}</div>
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
            <div style={{ fontWeight: 700, fontSize: 16 }}>{t("settings.confirmReplaceTitle")}</div>
            <div style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.6 }}>
              {t("settings.confirmReplaceDesc")}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setConfirm(false)}>{t("buttons.cancel")}</button>
              <button className="btn btn-primary" style={{ fontSize: 12, background: "#f43f5e", borderColor: "#f43f5e" }} onClick={doImport}>
                {t("settings.confirmYes")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

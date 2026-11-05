// LinkedIn connection card on the Profile page: set up the user's own LinkedIn
// developer app (Member Data Portability API), connect via OAuth or a pasted token,
// sync the profile (read-only) and adopt headline / About text into the profile.
// Backend: /api/linkedin/* in index.ts; setup guide: docs/linkedin-setup.md.
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCircle, Copy, Check, OpenNewWindow, LogOut, Settings, Key, ShieldCheck } from "iconoir-react";
import { api } from "../../lib/api";
import { copyText } from "../../lib/clipboard";
import "../check/check.css";
import "./linkedin.css";

type SyncJob = { id: string; status: "running" | "done" | "error"; step: number; total: number; domain?: string; startedAt: string; finishedAt?: string; error?: string; changed?: boolean; failed?: string[] };
type ProfileStats = { positions: number; positionsWithText: number; education: number; skills: number; certifications: number; languages: number; recommendations: number; posts: number; comments: number; articles: number; connections: number | null; groups: number };
type Current = { id: string; createdAt: string; source: string; name: string | null; headline: string | null; summary: string | null; stats: ProfileStats; failed: string[] };
type Status = {
  appConfigured: boolean; clientId: string | null; hasSecret: boolean; requestedScope: string; scopes: string[]; redirectUri: string;
  connected: boolean; expired: boolean; method: "oauth" | "token" | null; scope: string | null;
  connectedAt: string | null; expiresAt: string | null; daysLeft: number | null; lastSyncAt: string | null; lastSyncError: string | null;
  job: SyncJob | null; current: Current | null;
};

const DEV_PORTAL = "https://developer.linkedin.com/";
const TOKEN_TOOL = "https://www.linkedin.com/developers/tools/oauth/token-generator";
const DEFAULT_PAGE = "https://www.linkedin.com/company/member-data-portability-member-default-company";
/** LinkedIn's own set-up guide for the Member Data Portability (Member) product. */
const OFFICIAL_GUIDE = "https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/member-data-portability-member/?view=li-dma-data-portability-2026-08";
const AUTO_SYNC_MS = 24 * 3600 * 1000;

const errMsg = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

/** Small copy button with a check mark as feedback. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn btn-ghost btn-icon chk-icon-btn" title={label} aria-label={label}
      onClick={async () => { await copyText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>
      {done ? <Check width={12} height={12} /> : <Copy width={12} height={12} />}
    </button>
  );
}

export function LinkedInConnection({ headline, bio, onAdopt }: {
  /** Current profile values, to offer LinkedIn's text when it differs. */
  headline: string; bio: string;
  onAdopt: (patch: { headline?: string; linkedinBio?: string }) => void;
}) {
  const { t, i18n } = useTranslation();
  const [st, setSt] = useState<Status | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [mode, setMode] = useState<"oauth" | "token">("oauth");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scope, setScope] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const fmt = (iso: string | null) => iso
    ? new Date(iso).toLocaleDateString(i18n.language, { day: "2-digit", month: "2-digit", year: "numeric" }) : "–";
  const fmtTime = (iso: string) => `${fmt(iso)} ${new Date(iso).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })}`;

  const load = useCallback(async () => {
    try {
      const r = await api.get<Status>("/api/linkedin/status");
      setSt(r.data); setLoadErr(null);
      return r.data;
    } catch (e) { setLoadErr(errMsg(e, t("linkedinConnect.loadError"))); return null; }
  }, [t]);

  // First load: pick up the OAuth callback result from the URL, then auto-sync if stale.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("linkedin") === "connected") setNotice(t("linkedinConnect.connectedNotice"));
    const err = q.get("linkedin_error");
    if (err) setError(err === "state" ? t("linkedinConnect.stateError") : t("linkedinConnect.oauthError", { error: err }));
    if (q.has("linkedin") || q.has("linkedin_error")) {
      q.delete("linkedin"); q.delete("linkedin_error");
      window.history.replaceState(null, "", window.location.pathname + (q.toString() ? `?${q}` : ""));
    }
    load().then(s => {
      if (!s) return;
      setClientId(s.clientId ?? ""); setScope(s.requestedScope);
      const stale = !s.lastSyncAt || Date.now() - Date.parse(s.lastSyncAt) > AUTO_SYNC_MS;
      if (s.connected && stale && s.job?.status !== "running") void api.post("/api/linkedin/sync").then(load).catch(() => {});
    });
  }, [load, t]);

  const running = st?.job?.status === "running";
  useEffect(() => {
    if (!running) return;
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [running, load]);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setError(null); setNotice(null);
    try { await fn(); await load(); }
    catch (e) { setError(errMsg(e, t("linkedinConnect.genericError"))); }
    finally { setBusy(null); }
  };

  const connectOAuth = () => act("oauth", async () => {
    await api.put("/api/linkedin/app", { clientId, clientSecret, scope });
    setClientSecret("");
    const r = await api.get<{ url: string }>("/api/linkedin/auth-url");
    window.location.href = r.data.url;
  });
  const connectToken = () => act("token", async () => {
    await api.post("/api/linkedin/token", { accessToken: token });
    setToken(""); setSetupOpen(false); setNotice(t("linkedinConnect.connectedNotice"));
  });
  const sync = () => act("sync", () => api.post("/api/linkedin/sync"));
  const disconnect = (forgetApp: boolean) => act("disconnect", async () => {
    await api.delete(`/api/linkedin/connection${forgetApp ? "?forgetApp=1" : ""}`);
    setConfirmDisconnect(false);
    if (forgetApp) { setClientId(""); setClientSecret(""); }
  });

  if (!st) {
    return <div className="li-card">{loadErr ? <div className="chk-note" data-tone="error">{loadErr}</div>
      : <RefreshCircle width={14} height={14} className="chk-spin" style={{ color: "var(--fg-3)" }} />}</div>;
  }

  const cur = st.current;
  const job = st.job;
  const showSetup = setupOpen || (!st.connected && !st.expired);
  const warnSoon = st.connected && st.daysLeft !== null && st.daysLeft <= 7;
  const liHeadline = cur?.headline?.trim() ?? "";
  const liSummary = cur?.summary?.trim() ?? "";

  return (
    <div className="li-card">
      {/* ── Status line ── */}
      <div className="li-status">
        <span className="li-dot" data-state={st.connected ? (warnSoon ? "warn" : "on") : st.expired ? "off" : "none"} aria-hidden />
        <div className="li-status-text">
          <div className="li-status-title">
            {st.connected ? t("linkedinConnect.connected") : st.expired ? t("linkedinConnect.expired") : t("linkedinConnect.notConnected")}
          </div>
          <div className="chk-muted">
            {st.connected && <>{t("linkedinConnect.validUntil", { date: fmt(st.expiresAt), days: st.daysLeft ?? 0 })} · {st.method === "oauth" ? t("linkedinConnect.viaOauth") : t("linkedinConnect.viaToken")}</>}
            {!st.connected && !st.expired && t("linkedinConnect.intro")}
            {st.expired && t("linkedinConnect.expiredHint")}
            {st.lastSyncAt && <> · {t("linkedinConnect.lastSync", { date: fmtTime(st.lastSyncAt) })}</>}
          </div>
        </div>
        {st.connected && (
          <div className="li-actions">
            <button className="btn btn-secondary li-btn" disabled={running || !!busy} onClick={sync}>
              <RefreshCircle width={12} height={12} className={running || busy === "sync" ? "chk-spin" : undefined} />
              {running ? t("linkedinConnect.syncing") : t("linkedinConnect.syncNow")}
            </button>
            <button className="btn btn-ghost btn-icon chk-icon-btn" title={t("linkedinConnect.settings")} aria-expanded={setupOpen} onClick={() => setSetupOpen(v => !v)}>
              <Settings width={13} height={13} />
            </button>
          </div>
        )}
      </div>

      {running && job && (
        <div className="li-progress" role="status">
          <div className="chk-bar" data-status="onTrack"><span style={{ width: `${Math.round((job.step / job.total) * 100)}%` }} /></div>
          <span className="chk-muted">{t("linkedinConnect.progress", { step: job.step + 1, total: job.total, domain: t(`linkedinConnect.domain.${job.domain ?? "PROFILE"}`, job.domain ?? "") })}</span>
        </div>
      )}

      {notice && <div className="chk-note" data-tone="info">{notice}</div>}
      {error && <div className="chk-note" data-tone="error">{error}</div>}
      {warnSoon && <div className="chk-note">{t("linkedinConnect.expiresSoon", { days: st.daysLeft })}</div>}
      {!running && job?.status === "error" && job.error && <div className="chk-note" data-tone="error">{job.error}</div>}
      {!running && job?.status !== "error" && st.lastSyncError && <div className="chk-note">{st.lastSyncError}</div>}
      {!running && job?.status === "done" && job.changed === false && <div className="chk-muted">{t("linkedinConnect.unchanged")}</div>}

      {/* ── Synced profile summary + adopt into the app profile ── */}
      {cur && (
        <div className="li-summary">
          <div className="li-summary-head">
            <div>
              {cur.name && <div className="li-name">{cur.name}</div>}
              {liHeadline && <div className="li-headline">{liHeadline}</div>}
            </div>
            <span className="chk-muted">{t("linkedinConnect.version", { date: fmtTime(cur.createdAt) })}</span>
          </div>
          <div className="li-stats">
            {([
              ["positions", t("linkedinConnect.stats.positions", { n: cur.stats.positions, withText: cur.stats.positionsWithText })],
              ["skills", t("linkedinConnect.stats.skills", { n: cur.stats.skills })],
              ["recommendations", t("linkedinConnect.stats.recommendations", { n: cur.stats.recommendations })],
              ["education", t("linkedinConnect.stats.education", { n: cur.stats.education })],
              ["certifications", t("linkedinConnect.stats.certifications", { n: cur.stats.certifications })],
              ["languages", t("linkedinConnect.stats.languages", { n: cur.stats.languages })],
              ["posts", t("linkedinConnect.stats.posts", { n: cur.stats.posts })],
              ["comments", t("linkedinConnect.stats.comments", { n: cur.stats.comments })],
              ...(cur.stats.connections !== null ? [["connections", t("linkedinConnect.stats.connections", { n: cur.stats.connections })]] : []),
            ] as Array<[string, string]>).map(([k, label]) => <span key={k} className="li-stat">{label}</span>)}
          </div>
          {liHeadline && liHeadline !== headline.trim() && (
            <div className="li-adopt">
              <div className="li-adopt-label">{t("linkedinConnect.adoptHeadline")}</div>
              <div className="li-adopt-text">{liHeadline}</div>
              <div className="li-adopt-actions">
                <button className="btn btn-secondary li-btn" onClick={() => onAdopt({ headline: liHeadline })}>{t("linkedinConnect.adopt")}</button>
                <CopyButton text={liHeadline} label={t("linkedinConnect.copy")} />
              </div>
            </div>
          )}
          {liSummary && liSummary !== bio.trim() && (
            <div className="li-adopt">
              <div className="li-adopt-label">{t("linkedinConnect.adoptBio")}</div>
              <div className="li-adopt-text li-clamp">{liSummary}</div>
              <div className="li-adopt-actions">
                <button className="btn btn-secondary li-btn" onClick={() => onAdopt({ linkedinBio: liSummary })}>{t("linkedinConnect.adopt")}</button>
                <CopyButton text={liSummary} label={t("linkedinConnect.copy")} />
              </div>
            </div>
          )}
          <div className="chk-muted">{t("linkedinConnect.notProvided")}</div>
        </div>
      )}

      {/* ── Setup / reconnect ── */}
      {(showSetup || st.expired) && (
        <div className="li-setup">
          <div className="li-tabs" role="tablist">
            <button role="tab" aria-selected={mode === "oauth"} className={`tab chk-side-tab${mode === "oauth" ? " active" : ""}`} onClick={() => setMode("oauth")}>
              <ShieldCheck width={12} height={12} /> {t("linkedinConnect.modeOauth")}
            </button>
            <button role="tab" aria-selected={mode === "token"} className={`tab chk-side-tab${mode === "token" ? " active" : ""}`} onClick={() => setMode("token")}>
              <Key width={12} height={12} /> {t("linkedinConnect.modeToken")}
            </button>
          </div>

          <ol className="li-steps">
            <li>{t("linkedinConnect.step1")} <a href={DEV_PORTAL} target="_blank" rel="noreferrer">developer.linkedin.com <OpenNewWindow width={10} height={10} /></a></li>
            <li>
              {t("linkedinConnect.step2")} <a href={DEFAULT_PAGE} target="_blank" rel="noreferrer">{t("linkedinConnect.defaultPage")} <OpenNewWindow width={10} height={10} /></a>
              <div className="chk-note" data-tone="info" style={{ marginTop: 6 }}>{t("linkedinConnect.step2Why")}</div>
            </li>
            <li>{t("linkedinConnect.step3")}</li>
            {mode === "oauth"
              ? <li>{t("linkedinConnect.step4Oauth")}</li>
              : <li>{t("linkedinConnect.step4Token")} <a href={TOKEN_TOOL} target="_blank" rel="noreferrer">{t("linkedinConnect.tokenTool")} <OpenNewWindow width={10} height={10} /></a></li>}
          </ol>
          <a className="li-guide-link" href={OFFICIAL_GUIDE} target="_blank" rel="noreferrer">{t("linkedinConnect.officialGuide")} <OpenNewWindow width={10} height={10} /></a>

          {mode === "oauth" ? (
            <div className="li-form">
              <label className="li-field">
                <span>{t("linkedinConnect.redirectUri")}</span>
                <span className="li-copyline"><code>{st.redirectUri}</code><CopyButton text={st.redirectUri} label={t("linkedinConnect.copy")} /></span>
              </label>
              <label className="li-field">
                <span>{t("linkedinConnect.clientId")}</span>
                <input className="input-line" value={clientId} onChange={e => setClientId(e.target.value)} autoComplete="off" spellCheck={false} />
              </label>
              <label className="li-field">
                <span>{t("linkedinConnect.clientSecret")}</span>
                <input className="input-line" type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} autoComplete="new-password"
                  placeholder={st.hasSecret ? t("linkedinConnect.secretStored") : ""} />
              </label>
              <label className="li-field">
                <span>{t("linkedinConnect.scope")}</span>
                <select className="input-line" value={scope} onChange={e => setScope(e.target.value)}>
                  {st.scopes.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <div className="li-actions">
                <button className="btn btn-primary li-btn" disabled={!clientId.trim() || (!clientSecret.trim() && !st.hasSecret) || !!busy} onClick={connectOAuth}>
                  {busy === "oauth" && <RefreshCircle width={12} height={12} className="chk-spin" />} {st.connected || st.expired ? t("linkedinConnect.reconnect") : t("linkedinConnect.connect")}
                </button>
              </div>
              <div className="chk-muted">{t("linkedinConnect.oauthHint")}</div>
            </div>
          ) : (
            <div className="li-form">
              <label className="li-field">
                <span>{t("linkedinConnect.token")}</span>
                <textarea className="li-token" value={token} onChange={e => setToken(e.target.value)} rows={3} spellCheck={false} autoComplete="off" />
              </label>
              <div className="li-actions">
                <button className="btn btn-primary li-btn" disabled={token.trim().length < 20 || !!busy} onClick={connectToken}>
                  {busy === "token" && <RefreshCircle width={12} height={12} className="chk-spin" />} {t("linkedinConnect.checkToken")}
                </button>
              </div>
            </div>
          )}

          {(st.connected || st.appConfigured) && (
            <div className="li-disconnect">
              {!confirmDisconnect
                ? <button className="btn btn-ghost li-btn" onClick={() => setConfirmDisconnect(true)}><LogOut width={12} height={12} /> {t("linkedinConnect.disconnect")}</button>
                : <>
                    <span className="chk-muted">{t("linkedinConnect.disconnectConfirm")}</span>
                    <button className="btn btn-secondary li-btn" disabled={!!busy} onClick={() => disconnect(false)}>{t("linkedinConnect.disconnectKeepApp")}</button>
                    <button className="btn btn-ghost li-btn" disabled={!!busy} onClick={() => disconnect(true)}>{t("linkedinConnect.disconnectForget")}</button>
                    <button className="btn btn-ghost li-btn" onClick={() => setConfirmDisconnect(false)}>{t("linkedinConnect.cancel")}</button>
                  </>}
            </div>
          )}
        </div>
      )}

      <div className="li-privacy"><ShieldCheck width={12} height={12} /> {t("linkedinConnect.privacy")}</div>
    </div>
  );
}

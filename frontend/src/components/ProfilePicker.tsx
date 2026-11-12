// Desktop login screen (APP_MODE=desktop): pick a profile, unlock it with its PIN or
// password if it has one, or create a new profile. Replaces the e-mail/invite/Google/
// passkey login of the web version — on a shared family Mac a profile is a person.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, NavArrowLeft, User } from "iconoir-react";
import type { AuthMode, DesktopProfile } from "@application-pal/shared";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { APP_NAME } from "../lib/appName";

type View = { kind: "list" } | { kind: "unlock"; profile: DesktopProfile } | { kind: "create" };

function errorText(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

export function ProfilePicker() {
  const { t } = useTranslation();
  const { refetch } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [profiles, setProfiles] = useState<DesktopProfile[] | null>(null);
  const [view, setView] = useState<View>({ kind: "list" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<DesktopProfile[]>("/api/auth/profiles")
      .then(r => { setProfiles(r.data); if (r.data.length === 0) setView({ kind: "create" }); })
      .catch(() => setProfiles([]));
  }, []);

  const enter = async () => {
    queryClient.clear();          // nothing of the previous profile may stay in the cache
    await refetch();
    navigate("/", { replace: true });
  };

  const login = async (profile: DesktopProfile, secret?: string) => {
    setBusy(true); setError("");
    try {
      await api.post("/api/auth/profile-login", { id: profile.id, secret });
      await enter();
    } catch (err) {
      setError(errorText(err, t("profiles.loginFailed")));
    } finally { setBusy(false); }
  };

  const pick = (p: DesktopProfile) => {
    setError("");
    if (p.authMode === "none") void login(p);
    else setView({ kind: "unlock", profile: p });
  };

  return (
    <div className="profile-picker">
      <div className="profile-picker-card">
        <div className="profile-picker-head">
          <div className="profile-picker-title">{APP_NAME}</div>
          <div className="profile-picker-sub">
            {view.kind === "create" ? t("profiles.createTitle") : view.kind === "unlock" ? view.profile.name : t("profiles.whoIsThere")}
          </div>
        </div>

        {view.kind === "list" && (
          <div className="profile-grid">
            {(profiles ?? []).map(p => (
              <button key={p.id} className="profile-tile" onClick={() => pick(p)} disabled={busy}>
                <span className="profile-avatar">{p.name.trim().charAt(0).toUpperCase() || <User width={20} height={20} />}</span>
                <span className="profile-name">{p.name}</span>
                {p.authMode !== "none" && (
                  <span className="profile-lock" title={t(`profiles.mode.${p.authMode}`)}><Lock width={12} height={12} /></span>
                )}
              </button>
            ))}
            <button className="profile-tile profile-tile-add" onClick={() => { setError(""); setView({ kind: "create" }); }}>
              <span className="profile-avatar"><Plus width={20} height={20} /></span>
              <span className="profile-name">{t("profiles.add")}</span>
            </button>
          </div>
        )}

        {view.kind === "unlock" && (
          <UnlockForm profile={view.profile} busy={busy} onSubmit={secret => void login(view.profile, secret)} />
        )}

        {view.kind === "create" && (
          <CreateForm
            busy={busy}
            onSubmit={async body => {
              setBusy(true); setError("");
              try { await api.post("/api/auth/profiles", body); await enter(); }
              catch (err) { setError(errorText(err, t("profiles.createFailed"))); }
              finally { setBusy(false); }
            }}
          />
        )}

        {error && <div className="profile-error" role="alert">{error}</div>}

        {view.kind !== "list" && (profiles?.length ?? 0) > 0 && (
          <button className="btn btn-ghost profile-back" onClick={() => { setError(""); setView({ kind: "list" }); }}>
            <NavArrowLeft width={14} height={14} /> {t("profiles.back")}
          </button>
        )}
      </div>
    </div>
  );
}

function UnlockForm({ profile, busy, onSubmit }: { profile: DesktopProfile; busy: boolean; onSubmit: (secret: string) => void }) {
  const { t } = useTranslation();
  const [secret, setSecret] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const pin = profile.authMode === "pin";
  return (
    <form className="profile-form" onSubmit={e => { e.preventDefault(); if (secret) onSubmit(secret); }}>
      <div className="field">
        <label>{pin ? t("profiles.pin") : t("profiles.password")}</label>
        <input ref={ref} className="input-line" type="password" value={secret}
          inputMode={pin ? "numeric" : undefined} maxLength={pin ? 8 : undefined}
          autoComplete={pin ? "off" : "current-password"}
          onChange={e => setSecret(pin ? e.target.value.replace(/\D/g, "") : e.target.value)}
          style={pin ? { letterSpacing: "0.4em", fontSize: 18, textAlign: "center" } : undefined} />
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy || !secret}>{busy ? "…" : t("profiles.unlock")}</button>
    </form>
  );
}

function CreateForm({ busy, onSubmit }: {
  busy: boolean;
  onSubmit: (body: { name: string; authMode: AuthMode; secret?: string; email?: string }) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("none");
  const [secret, setSecret] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [localError, setLocalError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    if (!name.trim()) return setLocalError(t("profiles.nameMissing"));
    if (authMode === "pin" && !/^\d{4,8}$/.test(secret)) return setLocalError(t("profiles.pinRule"));
    if (authMode === "password" && secret.length < 8) return setLocalError(t("profiles.passwordRule"));
    if (authMode !== "none" && secret !== confirm) return setLocalError(t("profiles.mismatch"));
    onSubmit({ name: name.trim(), authMode, secret: authMode === "none" ? undefined : secret, email: email.trim() || undefined });
  };

  return (
    <form className="profile-form" onSubmit={submit}>
      <div className="field">
        <label>{t("profiles.name")}</label>
        <input className="input-line" value={name} onChange={e => setName(e.target.value)} maxLength={60} autoFocus placeholder={t("profiles.namePlaceholder")} />
      </div>
      <div className="field">
        <label>{t("profiles.protection")}</label>
        <div className="profile-modes" role="radiogroup">
          {(["none", "pin", "password"] as AuthMode[]).map(m => (
            <button type="button" key={m} role="radio" aria-checked={authMode === m}
              className={`profile-mode${authMode === m ? " active" : ""}`}
              onClick={() => { setAuthMode(m); setSecret(""); setConfirm(""); }}>
              {t(`profiles.mode.${m}`)}
            </button>
          ))}
        </div>
        <div className="profile-hint">{t(`profiles.modeHint.${authMode}`)}</div>
      </div>
      {authMode !== "none" && (
        <>
          <div className="field">
            <label>{authMode === "pin" ? t("profiles.pin") : t("profiles.password")}</label>
            <input className="input-line" type="password" value={secret} inputMode={authMode === "pin" ? "numeric" : undefined}
              maxLength={authMode === "pin" ? 8 : undefined} autoComplete="new-password"
              onChange={e => setSecret(authMode === "pin" ? e.target.value.replace(/\D/g, "") : e.target.value)}
              placeholder={authMode === "pin" ? t("profiles.pinRule") : t("profiles.passwordRule")} />
          </div>
          <div className="field">
            <label>{t("profiles.repeat")}</label>
            <input className="input-line" type="password" value={confirm} inputMode={authMode === "pin" ? "numeric" : undefined}
              maxLength={authMode === "pin" ? 8 : undefined} autoComplete="new-password"
              onChange={e => setConfirm(authMode === "pin" ? e.target.value.replace(/\D/g, "") : e.target.value)} />
          </div>
        </>
      )}
      <div className="field">
        <label>{t("profiles.email")} <span className="profile-optional">{t("profiles.optional")}</span></label>
        <input className="input-line" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@beispiel.ch" />
      </div>
      {localError && <div className="profile-error" role="alert">{localError}</div>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "…" : t("profiles.create")}</button>
    </form>
  );
}

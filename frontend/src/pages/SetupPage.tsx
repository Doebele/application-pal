import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { startAuthentication } from "@simplewebauthn/browser";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";

type Mode = "setup" | "login";

const LS_KEY = "pal-remembered-users";
type RememberedEntry = { email: string; token: string };
export function storeRememberedToken(email: string, token: string) {
  try {
    const list: RememberedEntry[] = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
    const filtered = list.filter(e => e.email !== email);
    localStorage.setItem(LS_KEY, JSON.stringify([...filtered, { email, token }]));
  } catch { /* ignore */ }
}
export function removeRememberedToken(email: string) {
  try {
    const list: RememberedEntry[] = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
    localStorage.setItem(LS_KEY, JSON.stringify(list.filter(e => e.email !== email)));
  } catch { /* ignore */ }
}
export function getRememberedToken(email: string): string | null {
  try {
    const list: RememberedEntry[] = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
    return list.find(e => e.email === email)?.token ?? null;
  } catch { return null; }
}

export function SetupPage() {
  const { refetch } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Invite token from URL (?invite=TOKEN) — set automatically when using invite link
  const [inviteToken, setInviteToken] = useState(searchParams.get("invite") ?? "");
  const hasInvite = !!inviteToken;

  // Pre-fill email from URL (?email=...) — set when switching to a known user
  const prefillEmail = searchParams.get("email") ?? "";

  // ?mode=register → open directly on the Register tab (user-switch "Registrieren" button)
  const forceRegister = searchParams.get("mode") === "register";

  // Determine initial mode:
  //   forceRegister=true  → setup (Register tab)
  //   prefillEmail present → login  (Login tab with email prefilled)
  //   otherwise           → setup, then useEffect may switch to login if account exists
  const [mode, setMode] = useState<Mode>(
    forceRegister ? "setup" : prefillEmail ? "login" : "setup"
  );
  const [hasAccount, setHasAccount] = useState(false);

  useEffect(() => {
    api.get<{ setup: boolean }>("/api/auth/status").then(r => {
      if (r.data.setup) {
        setHasAccount(true);
        // Only auto-switch to login when we're NOT forcing the register tab
        if (!forceRegister && !hasInvite) setMode("login");
        else if (hasInvite) setMode("setup");
      }
    }).catch(() => {});
  }, [hasInvite, forceRegister]);

  // Shared fields
  const [email, setEmail]     = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const supportsPasskey = typeof window !== "undefined" && !!window.PublicKeyCredential;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      if (mode === "setup") {
        if (password !== confirm) { setError("Passwörter stimmen nicht überein"); setLoading(false); return; }
        if (password.length < 8)  { setError("Passwort muss mindestens 8 Zeichen haben"); setLoading(false); return; }
        // Send invite token when registering additional users
        const setupRes = await api.post<{ email: string; autoLoginToken?: string }>(
          "/api/auth/setup", { email, password, inviteToken: inviteToken || undefined }
        );
        if (setupRes.data.autoLoginToken) storeRememberedToken(email, setupRes.data.autoLoginToken);
      } else {
        const loginRes = await api.post<{ email: string; autoLoginToken?: string }>(
          "/api/auth/login", { email, password, rememberMe }
        );
        if (loginRes.data.autoLoginToken) storeRememberedToken(email, loginRes.data.autoLoginToken);
        else removeRememberedToken(email); // explicit login without rememberMe clears old token
      }
      await refetch();
      navigate("/", { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? (mode === "setup" ? "Fehler beim Einrichten" : "Anmeldung fehlgeschlagen"));
    } finally { setLoading(false); }
  };

  const loginWithGoogle = async () => {
    const res = await api.get<{ url: string }>("/api/google/auth-url").catch(() => null);
    if (res?.data?.url) window.location.href = res.data.url;
    else setError("Google nicht konfiguriert. Bitte E-Mail/Passwort verwenden.");
  };

  const loginWithPasskey = async () => {
    setPasskeyLoading(true); setError("");
    try {
      const optRes = await api.get<PublicKeyCredentialRequestOptionsJSON>("/api/auth/webauthn/login-options");
      const assertion = await startAuthentication({ optionsJSON: optRes.data });
      await api.post("/api/auth/webauthn/login", { response: assertion });
      await refetch();
      navigate("/", { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? "Passkey-Anmeldung fehlgeschlagen");
    } finally { setPasskeyLoading(false); }
  };

  return (
    <div style={page}>
      <div style={card}>
        {/* Logo / App name */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--fg-1)" }}>
            Application Pal
          </div>
          <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 3 }}>
            Dein persönliches Bewerbungs-Tool
          </div>
        </div>

        {/* Tab switcher — always visible */}
        <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: 10, padding: 3, marginBottom: 24, border: "1px solid var(--border)" }}>
          <TabBtn active={mode === "login"} onClick={() => { setMode("login"); setError(""); }}>
            Anmelden
          </TabBtn>
          <TabBtn active={mode === "setup"} onClick={() => { setMode("setup"); setError(""); }}>
            Registrieren
          </TabBtn>
        </div>

        {/* Google + Passkey buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 20 }}>
          <button className="btn btn-secondary" onClick={loginWithGoogle}
            style={{ gap: 8, justifyContent: "center", width: "100%" }}>
            <svg width="15" height="15" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {mode === "setup" ? "Mit Google registrieren" : "Mit Google anmelden"}
          </button>

          {supportsPasskey && mode === "login" && (
            <button className="btn btn-secondary" onClick={loginWithPasskey} disabled={passkeyLoading}
              style={{ gap: 8, justifyContent: "center", width: "100%" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/>
                <path d="M17 18l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {passkeyLoading ? "Warten…" : "Mit Passkey anmelden"}
            </button>
          )}
        </div>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, color: "var(--fg-3)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          oder mit E-Mail
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        {/* Form */}
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field">
            <label>E-Mail</label>
            <input className="input-line" type="email" value={email}
              onChange={e => setEmail(e.target.value)} placeholder="deine@email.de" required autoFocus={!prefillEmail} />
          </div>
          <div className="field">
            <label>Passwort</label>
            <input className="input-line" type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === "setup" ? "Mindestens 8 Zeichen" : "Passwort"} required autoFocus={!!prefillEmail && mode === "login"} />
          </div>
          {mode === "setup" && (
            <>
              <div className="field">
                <label>Passwort bestätigen</label>
                <input className="input-line" type="password" value={confirm}
                  onChange={e => setConfirm(e.target.value)} placeholder="Passwort wiederholen" required />
              </div>
              {/* Invite token — required for additional users, pre-filled via ?invite= URL */}
              {hasAccount && (
                <div className="field">
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    Einladungscode
                    <span style={{ fontSize: 10, color: "var(--fg-3)", fontWeight: 400 }}>
                      — erforderlich für neue Konten
                    </span>
                  </label>
                  <input
                    className="input-line"
                    type="text"
                    value={inviteToken}
                    onChange={e => setInviteToken(e.target.value)}
                    placeholder="Code aus dem Einladungslink"
                    required
                    style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.04em" }}
                  />
                  {hasInvite ? (
                    <div style={{ fontSize: 11, color: "#4ade80", marginTop: 4 }}>
                      ✓ Einladungslink aktiv
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 4, lineHeight: 1.5 }}>
                      Einladungslinks werden in den Einstellungen unter „Nutzer einladen" erstellt.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {mode === "login" && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: "var(--accent)", cursor: "pointer", flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "var(--fg-2)" }}>Auf diesem Gerät angemeldet bleiben</span>
            </label>
          )}
          {error && (
            <div style={{ fontSize: 12, color: "#f87171", background: "rgba(248,113,113,0.1)", borderRadius: 7, padding: "8px 12px" }}>
              {error}
            </div>
          )}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 2 }}>
            {loading ? "…" : mode === "setup" ? "Konto erstellen" : "Anmelden"}
          </button>
        </form>

        {mode === "login" && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <Link to="/recovery" style={{ fontSize: 12, color: "var(--fg-3)", textDecoration: "none" }}>
              Passwort vergessen?
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, disabled, title, children }: {
  active: boolean; onClick: () => void;
  disabled?: boolean; title?: string;
  children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      flex: 1, padding: "7px 12px", borderRadius: 8, border: "none", cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: active ? 600 : 400,
      background: active ? "var(--surface)" : "transparent",
      color: active ? "var(--fg-1)" : "var(--fg-3)",
      boxShadow: active ? "0 1px 4px rgba(0,0,0,0.15)" : "none",
      transition: "all 0.15s", opacity: disabled ? 0.4 : 1
    }}>
      {children}
    </button>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
  background: "var(--bg)", padding: 20
};
const card: React.CSSProperties = {
  width: "100%", maxWidth: 400, background: "var(--surface)", borderRadius: 18,
  border: "1px solid var(--border)", padding: "36px 32px", boxShadow: "0 8px 40px rgba(0,0,0,0.35)"
};

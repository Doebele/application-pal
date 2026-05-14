import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

type Step = "email" | "code" | "done";

export function RecoveryPage() {
  const navigate = useNavigate();
  const [step, setStep]         = useState<Step>("email");
  const [email, setEmail]       = useState("");
  const [code, setCode]         = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await api.post("/api/auth/forgot-password", { email });
      setStep("code");
    } catch { setError("Fehler beim Senden"); }
    finally { setLoading(false); }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) { setError("Passwörter stimmen nicht überein"); return; }
    if (newPassword.length < 8)  { setError("Passwort muss mindestens 8 Zeichen haben"); return; }
    setError(""); setLoading(true);
    try {
      await api.post("/api/auth/reset-password", { email, code, newPassword });
      setStep("done");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? "Fehler beim Zurücksetzen");
    } finally { setLoading(false); }
  };

  return (
    <div style={page}>
      <div style={card}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: "var(--fg-1)" }}>Passwort zurücksetzen</div>
        {step === "email" && (
          <>
            <div style={{ fontSize: 13, color: "var(--fg-3)", marginBottom: 24 }}>Gib deine E-Mail ein — du erhältst einen 6-stelligen Code.</div>
            <form onSubmit={sendCode} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <label>E-Mail</label>
                <input className="input-line" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="deine@email.de" required autoFocus />
              </div>
              {error && <ErrBox msg={error} />}
              <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? "Senden…" : "Code senden"}</button>
            </form>
          </>
        )}
        {step === "code" && (
          <>
            <div style={{ fontSize: 13, color: "var(--fg-3)", marginBottom: 24 }}>Code an <strong>{email}</strong> gesendet. Gültig für 15 Minuten.</div>
            <form onSubmit={resetPassword} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <label>6-stelliger Code</label>
                <input className="input-line" type="text" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value)} placeholder="123456" required autoFocus />
              </div>
              <div className="field">
                <label>Neues Passwort</label>
                <input className="input-line" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mindestens 8 Zeichen" required />
              </div>
              <div className="field">
                <label>Passwort bestätigen</label>
                <input className="input-line" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Passwort wiederholen" required />
              </div>
              {error && <ErrBox msg={error} />}
              <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? "Speichern…" : "Passwort setzen"}</button>
            </form>
          </>
        )}
        {step === "done" && (
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <div style={{ color: "var(--fg-1)", marginBottom: 20 }}>Passwort erfolgreich geändert.</div>
            <button className="btn btn-primary" onClick={() => navigate("/login", { replace: true })}>Zur Anmeldung</button>
          </div>
        )}
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <Link to="/login" style={{ fontSize: 12, color: "var(--fg-3)", textDecoration: "none" }}>← Zurück zur Anmeldung</Link>
        </div>
      </div>
    </div>
  );
}

function ErrBox({ msg }: { msg: string }) {
  return <div style={{ fontSize: 12, color: "#f87171", background: "rgba(248,113,113,0.1)", borderRadius: 7, padding: "8px 12px" }}>{msg}</div>;
}

const page: React.CSSProperties = {
  minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
  background: "var(--bg)", padding: 20
};
const card: React.CSSProperties = {
  width: "100%", maxWidth: 380, background: "var(--surface)", borderRadius: 16,
  border: "1px solid var(--border)", padding: "36px 32px", boxShadow: "0 8px 32px rgba(0,0,0,0.3)"
};

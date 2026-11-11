// Setup wizard (desktop, M3): shown once after a new profile's first login
// (`ui_settings.onboarding === "pending"`), and again from Settings on request.
// Four short steps — who you are (persona), AI, Google, LinkedIn — each skippable.
// Everything it sets is the same state the Settings page edits; nothing here is
// wizard-only, so skipping a step just leaves the default.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, WarningCircle, RefreshCircle, NavArrowLeft, NavArrowRight } from "iconoir-react";
import { api } from "../lib/api";
import { useUiStore, type AiProvider, type AiSecretProvider } from "../lib/store";
import imgSchulabgaenger   from "../assets/personas/schulabgaenger.png";
import imgBerufseinsteiger from "../assets/personas/berufseinsteiger.png";
import imgBerufsumsteiger  from "../assets/personas/berufsumsteiger.png";

type Persona = "schulabgaenger" | "berufseinsteiger" | "berufsumsteiger";
type Step = "welcome" | "ai" | "google" | "linkedin" | "done";

const CLOUD: { id: AiSecretProvider; label: string; placeholder: string; url: string }[] = [
  { id: "anthropic",  label: "Anthropic (Claude)", placeholder: "sk-ant-…", url: "https://console.anthropic.com/settings/keys" },
  { id: "openai",     label: "OpenAI",             placeholder: "sk-…",     url: "https://platform.openai.com/api-keys" },
  { id: "gemini",     label: "Google Gemini",      placeholder: "AIza…",    url: "https://aistudio.google.com/apikey" },
  { id: "openrouter", label: "OpenRouter",         placeholder: "sk-or-…",  url: "https://openrouter.ai/keys" },
];

export function finishOnboarding() {
  return api.patch("/api/settings", { onboarding: "done" }).catch(() => {});
}

export function SetupWizard({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("welcome");
  const [persona, setPersona] = useState<Persona | null>(null);
  const [openLinkedIn, setOpenLinkedIn] = useState(false);
  const [aiOk, setAiOk] = useState(false);
  const [googleOk, setGoogleOk] = useState(false);

  useEffect(() => {
    api.get<{ persona?: Persona | null }>("/api/profile").then(r => setPersona(r.data.persona ?? null)).catch(() => {});
  }, []);

  const wantsLinkedIn = persona === "berufseinsteiger" || persona === "berufsumsteiger";
  const order: Step[] = ["welcome", "ai", "google", ...(wantsLinkedIn ? ["linkedin" as const] : []), "done"];
  const idx = order.indexOf(step);
  const next = () => setStep(order[Math.min(idx + 1, order.length - 1)]);
  const back = () => setStep(order[Math.max(idx - 1, 0)]);

  const choosePersona = async (p: Persona) => {
    setPersona(p);
    await api.patch("/api/profile", { persona: p }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  };

  const finish = async () => {
    await finishOnboarding();
    onClose();
    navigate(openLinkedIn ? "/linkedin" : "/", { replace: true });
  };

  return (
    <div className="wizard">
      <div className="wizard-card">
        <div className="wizard-steps" aria-hidden>
          {order.map((s, i) => <span key={s} className={"wizard-dot" + (i <= idx ? " on" : "")} />)}
        </div>

        {step === "welcome" && (
          <>
            <h1 className="wizard-title">{t("wizard.welcomeTitle")}</h1>
            <p className="wizard-text">{t("wizard.welcomeText")}</p>
            <div className="wizard-personas">
              {([
                ["schulabgaenger", imgSchulabgaenger, t("persona.schulabgaenger"), t("persona.schulabgaengerSub")],
                ["berufseinsteiger", imgBerufseinsteiger, t("persona.berufseinsteiger"), t("persona.berufseinsteigervSub")],
                ["berufsumsteiger", imgBerufsumsteiger, t("persona.berufsumsteiger"), t("persona.berufsumsteigerSub")],
              ] as [Persona, string, string, string][]).map(([v, img, label, sub]) => (
                <button key={v} type="button" className={"wizard-persona" + (persona === v ? " active" : "")} onClick={() => choosePersona(v)}>
                  <img src={img} alt="" />
                  <span className="wizard-persona-label">{label}</span>
                  <span className="wizard-persona-sub">{sub}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "ai" && <AiStep onReady={setAiOk} />}
        {step === "google" && <GoogleStep onConnected={setGoogleOk} />}

        {step === "linkedin" && (
          <>
            <h1 className="wizard-title">{t("wizard.liTitle")}</h1>
            <p className="wizard-text">{t(persona === "berufseinsteiger" ? "wizard.liTextBuild" : "wizard.liText")}</p>
            <label className="wizard-check">
              <input type="checkbox" checked={openLinkedIn} onChange={e => setOpenLinkedIn(e.target.checked)} />
              {t("wizard.liOpen")}
            </label>
            <p className="wizard-hint">{t("wizard.liHint")}</p>
          </>
        )}

        {step === "done" && (
          <>
            <h1 className="wizard-title">{t("wizard.doneTitle")}</h1>
            <ul className="wizard-summary">
              <SummaryItem ok={!!persona} label={persona ? t(`persona.${persona}`) : t("wizard.sumNoPersona")} />
              <SummaryItem ok={aiOk} label={aiOk ? t("wizard.sumAi") : t("wizard.sumNoAi")} />
              <SummaryItem ok={googleOk} label={googleOk ? t("wizard.sumGoogle") : t("wizard.sumNoGoogle")} />
            </ul>
            <p className="wizard-hint">{t("wizard.doneHint")}</p>
          </>
        )}

        <div className="wizard-nav">
          {idx > 0 ? (
            <button className="btn btn-ghost" onClick={back}><NavArrowLeft width={14} height={14} /> {t("wizard.back")}</button>
          ) : (
            <button className="btn btn-ghost" onClick={finish}>{t("wizard.skipAll")}</button>
          )}
          {step === "done" ? (
            <button className="btn btn-primary" onClick={finish}>{t("wizard.start")}</button>
          ) : (
            <button className="btn btn-primary" onClick={next}>
              {t(step === "welcome" && !persona ? "wizard.skip" : "wizard.next")} <NavArrowRight width={14} height={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={ok ? "ok" : ""}>
      {ok ? <CheckCircle width={16} height={16} /> : <span className="wizard-summary-open" />}
      {label}
    </li>
  );
}

// ─── Step: AI ─────────────────────────────────────────────────
type Local = { url: string; models: string[] } | null;

function AiStep({ onReady }: { onReady: (ok: boolean) => void }) {
  const { t } = useTranslation();
  const { ai, setAi, serverSecrets, setServerSecrets, secretsAvailable } = useUiStore();
  const [lm, setLm] = useState<Local | "loading">("loading");
  const [ollama, setOllama] = useState<Local | "loading">("loading");
  const [key, setKey] = useState("");
  const [test, setTest] = useState<{ state: "idle" | "running" | "ok" | "fail"; text?: string }>({ state: "idle" });

  const detect = () => {
    setLm("loading"); setOllama("loading");
    const probe = (path: string, url: string, set: (v: Local) => void) =>
      api.get<{ models: string[] }>(`${path}?url=${encodeURIComponent(url)}`)
        // Embedding models can't write text — leave them out of the choice.
        .then(r => { const models = r.data.models.filter(m => !/embed/i.test(m)); set(models.length ? { url, models } : null); })
        .catch(() => set(null));
    probe("/api/lm-studio/models", "http://localhost:1234", setLm);
    probe("/api/ollama/models", "http://localhost:11434", setOllama);
  };
  useEffect(detect, []);

  const pick = (provider: AiProvider, patch: Record<string, string> = {}) => {
    setAi({ provider, ...patch });
    setTest({ state: "idle" });
  };

  const cloud = CLOUD.find(c => c.id === ai.provider);
  const hasKey = cloud ? !!serverSecrets[cloud.id] : false;

  const saveKey = async () => {
    if (!cloud || !key.trim()) return;
    if (!secretsAvailable) { setAi({ [`${cloud.id}ApiKey`]: key.trim() }); setKey(""); return; }
    const r = await api.put<{ secrets: typeof serverSecrets }>("/api/settings/secrets", { keys: { [cloud.id]: key.trim() } }).catch(() => null);
    if (r) { setServerSecrets(true, r.data.secrets); setKey(""); }
  };

  const runTest = async () => {
    setTest({ state: "running" });
    const r = await api.post<{ ok: boolean; reply?: string; error?: string; ms: number }>("/api/ai/test", { ai: useUiStore.getState().ai })
      .catch(() => null);
    if (r?.data.ok) { setTest({ state: "ok", text: t("wizard.aiTestOk", { s: (r.data.ms / 1000).toFixed(1) }) }); onReady(true); }
    else { setTest({ state: "fail", text: r?.data.error ?? t("wizard.aiTestFail") }); onReady(false); }
  };

  const localOption = (provider: "lm-studio" | "ollama", label: string, found: Local | "loading", modelKey: "lmStudioModel" | "ollamaModel", urlKey: "lmStudioUrl" | "ollamaUrl") => (
    <div className={"wizard-option" + (ai.provider === provider ? " active" : "")}>
      <button type="button" className="wizard-option-head" disabled={!found || found === "loading"}
        onClick={() => found && found !== "loading" && pick(provider, { [urlKey]: found.url, [modelKey]: ai[modelKey] && found.models.includes(ai[modelKey]) ? ai[modelKey] : found.models[0] })}>
        <span className="wizard-option-label">{label}</span>
        <span className="wizard-option-state">
          {found === "loading" ? <RefreshCircle width={13} height={13} className="spin" />
            : found ? t("wizard.aiFound", { count: found.models.length }) : t("wizard.aiNotFound")}
        </span>
      </button>
      {ai.provider === provider && found && found !== "loading" && (
        <select value={ai[modelKey]} onChange={e => { setAi({ [modelKey]: e.target.value }); setTest({ state: "idle" }); }}>
          {found.models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      )}
    </div>
  );

  return (
    <>
      <h1 className="wizard-title">{t("wizard.aiTitle")}</h1>
      <p className="wizard-text">{t("wizard.aiText")}</p>

      <div className="wizard-group-label">{t("wizard.aiLocal")}</div>
      {localOption("lm-studio", "LM Studio", lm, "lmStudioModel", "lmStudioUrl")}
      {localOption("ollama", "Ollama", ollama, "ollamaModel", "ollamaUrl")}
      {lm === null && ollama === null && (
        <p className="wizard-hint">
          {t("wizard.aiLocalMissing")} <a href="https://lmstudio.ai" target="_blank" rel="noreferrer">lmstudio.ai</a> ·{" "}
          <button type="button" className="link-btn" onClick={detect}>{t("wizard.aiRetry")}</button>
        </p>
      )}

      <div className="wizard-group-label">{t("wizard.aiCloud")}</div>
      <div className="wizard-pills">
        {CLOUD.map(c => (
          <button key={c.id} type="button" className={"wizard-pill" + (ai.provider === c.id ? " active" : "")} onClick={() => pick(c.id)}>{c.label}</button>
        ))}
      </div>
      {cloud && (
        <div className="wizard-key">
          {hasKey ? (
            <span className="wizard-key-stored"><CheckCircle width={14} height={14} /> {t("settings.keyStored")}</span>
          ) : (
            <>
              <input type="password" value={key} placeholder={cloud.placeholder} autoComplete="off"
                onChange={e => setKey(e.target.value)} onKeyDown={e => e.key === "Enter" && saveKey()} />
              <button className="btn btn-secondary" onClick={saveKey} disabled={!key.trim()}>{t("wizard.aiSaveKey")}</button>
            </>
          )}
          <a className="wizard-hint" href={cloud.url} target="_blank" rel="noreferrer">{t("wizard.aiGetKey")}</a>
        </div>
      )}

      {ai.provider !== "none" && (
        <div className="wizard-test">
          <button className="btn btn-secondary" onClick={runTest} disabled={test.state === "running" || (!!cloud && !hasKey && !ai[`${cloud.id}ApiKey` as const])}>
            {test.state === "running" ? <><RefreshCircle width={13} height={13} className="spin" /> {t("wizard.aiTesting")}</> : t("wizard.aiTest")}
          </button>
          {test.state === "ok" && <span className="wizard-ok"><CheckCircle width={14} height={14} /> {test.text}</span>}
          {test.state === "fail" && <span className="wizard-fail"><WarningCircle width={14} height={14} /> {test.text}</span>}
        </div>
      )}
      <p className="wizard-hint">{t("wizard.aiPrivacy")}</p>
    </>
  );
}

// ─── Step: Google ─────────────────────────────────────────────
function GoogleStep({ onConnected }: { onConnected: (ok: boolean) => void }) {
  const { t } = useTranslation();
  const [state, setState] = useState<"loading" | "off" | "unavailable" | "waiting" | "on">("loading");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ connected: boolean; configured?: boolean }>("/api/google/status")
      .then(r => { setState(r.data.connected ? "on" : r.data.configured === false ? "unavailable" : "off"); onConnected(r.data.connected); })
      .catch(() => setState("off"));
  }, [onConnected]);

  useEffect(() => {
    if (state !== "waiting") return;
    const started = Date.now();
    const timer = setInterval(async () => {
      const r = await api.get<{ connected: boolean }>("/api/google/status").catch(() => null);
      if (r?.data.connected) { setState("on"); onConnected(true); }
      else if (Date.now() - started > 5 * 60 * 1000) { setState("off"); setErr(t("settings.googleTimeout")); }
    }, 2000);
    return () => clearInterval(timer);
  }, [state, onConnected, t]);

  const connect = async () => {
    setErr(null);
    try { await api.post("/api/google/connect"); setState("waiting"); }
    catch (e) { setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t("settings.googleConnectFailed")); }
  };

  return (
    <>
      <h1 className="wizard-title">{t("wizard.googleTitle")}</h1>
      <p className="wizard-text">{t("wizard.googleText")}</p>
      <ul className="wizard-bullets">
        <li>{t("wizard.googleUse1")}</li>
        <li>{t("wizard.googleUse2")}</li>
        <li>{t("wizard.googleUse3")}</li>
      </ul>
      {state === "on" && <div className="wizard-ok"><CheckCircle width={16} height={16} /> {t("settings.connected")}</div>}
      {state === "off" && <button className="btn btn-primary" onClick={connect}>{t("settings.connectGoogle")}</button>}
      {state === "waiting" && (
        <>
          <button className="btn btn-primary" disabled><RefreshCircle width={13} height={13} className="spin" /> {t("settings.googleWaiting")}</button>
          <p className="wizard-hint">{t("settings.googleBrowserHint")}</p>
        </>
      )}
      {state === "unavailable" && <p className="wizard-hint">{t("wizard.googleUnavailable")}</p>}
      {err && <div className="wizard-fail"><WarningCircle width={14} height={14} /> {err}</div>}
      <p className="wizard-hint">{t("wizard.googlePrivacy")}</p>
    </>
  );
}

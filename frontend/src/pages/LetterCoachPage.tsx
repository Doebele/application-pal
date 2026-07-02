import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCircle, InfoCircle, ProfileCircle, Folder, SendMail } from "iconoir-react";
import { Link } from "react-router-dom";
import { Topbar } from "../components/Topbar";
import { api } from "../lib/api";

type LetterConfig = {
  structure?: string;
  values?: string;
  strengths?: string;
  phrases?: string;
  styleRules?: string;
  noGos?: string;
  referenceLetter?: string;
};

const FIELD_KEYS: (keyof LetterConfig)[] = ["structure", "values", "strengths", "phrases", "styleRules", "noGos", "referenceLetter"];

const DEFAULTS: Record<Exclude<keyof LetterConfig, "referenceLetter">, string> = {
  structure:
    "1. Betreff: Rolle + ggf. Referenznummer\n" +
    "2. Einstieg (2–3 Sätze): aufmerksamkeitsstarker Hook mit konkretem Firmen-/Produktbezug — kein \"Hiermit bewerbe ich mich\"\n" +
    "3. Warum ich: 2–3 Kernstärken mit quantifizierten Belegen, gespiegelt an den Top-Anforderungen der Stelle\n" +
    "4. Warum diese Firma: echter Bezug zu Produkt/Kultur/Mission\n" +
    "5. Abschluss: selbstbewusster Call-to-Action, ggf. Verfügbarkeit/Eintrittstermin\n" +
    "Länge: max. 350 Wörter.",
  values: "",
  strengths: "",
  phrases: "",
  styleRules:
    "Aktive Sprache, kurze Sätze, keine Floskeln oder unbelegten Superlative. " +
    "Keywords aus der Stellenbeschreibung spiegeln. Schweizer Rechtschreibung (ss statt ß). " +
    "Belege statt Adjektiv-Listen.",
  noGos: "\"Hiermit bewerbe ich mich...\", generische Floskeln, unbelegte Superlative (\"hochmotiviert\", \"teamfähig\").",
};

function AutoResizeTextarea({ value, onChange, onBlur, placeholder, minRows = 3 }: {
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
      style={{ resize: "none", overflow: "hidden", width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--fg-1)", fontFamily: "var(--font-sans)", fontSize: 13, outline: "none" }}
    />
  );
}

function Section({ fieldKey, label, hint, value, onChange, onBlur, minRows }: {
  fieldKey: keyof LetterConfig;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  minRows?: number;
}) {
  const { t } = useTranslation();
  const hasDefault = fieldKey !== "referenceLetter" && DEFAULTS[fieldKey].trim().length > 0;
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <div className="eyebrow" style={{ flex: 1 }}>{label}</div>
        {hasDefault && !value.trim() && (
          <button
            className="btn btn-ghost"
            style={{ fontSize: 11, padding: "3px 8px" }}
            onClick={() => { onChange(DEFAULTS[fieldKey as Exclude<keyof LetterConfig, "referenceLetter">]); onBlur(); }}
          >
            {t("letterCoach.useDefault")}
          </button>
        )}
      </div>
      <div style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 8, lineHeight: 1.5 }}>{hint}</div>
      <AutoResizeTextarea value={value} onChange={onChange} onBlur={onBlur} minRows={minRows} />
    </div>
  );
}

export function LetterCoachPage() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<LetterConfig>({});
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<{ letterConfig?: string | null }>("/api/profile")
      .then(r => {
        try { setConfig(r.data.letterConfig ? JSON.parse(r.data.letterConfig) : {}); }
        catch { setConfig({}); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback((patch: LetterConfig) => {
    const next = { ...config, ...patch };
    setConfig(next);
    api.patch("/api/profile", { letterConfig: JSON.stringify(next) })
      .then(() => { setSaved(true); setTimeout(() => setSaved(false), 2000); })
      .catch(() => {});
  }, [config]);

  const fieldProps = (key: keyof LetterConfig) => ({
    value: config[key] ?? "",
    onChange: (v: string) => setConfig(c => ({ ...c, [key]: v })),
    onBlur: () => save({ [key]: config[key] ?? "" }),
  });

  if (loading) {
    return (
      <>
        <Topbar title={t("letterCoach.title")} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
          <RefreshCircle width={20} height={20} style={{ animation: "spin 1s linear infinite", color: "var(--fg-3)" }} />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title={t("letterCoach.title")} sub={t("letterCoach.sub")} />
      <div className="page-content" style={{ maxWidth: 720 }}>

        <div style={{
          display: "flex", gap: 10, padding: "12px 14px", borderRadius: 8,
          background: "var(--accent-08)", border: "1px solid var(--accent-15)", marginBottom: 28
        }}>
          <InfoCircle width={16} height={16} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, color: "var(--fg-2)", lineHeight: 1.6 }}>
            {t("letterCoach.infoText")}
            <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
              <Link to="/profile" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
                <ProfileCircle width={12} height={12} /> {t("letterCoach.linkProfile")}
              </Link>
              <Link to="/documents" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
                <Folder width={12} height={12} /> {t("letterCoach.linkDocuments")}
              </Link>
            </div>
          </div>
        </div>

        <Section fieldKey="structure" label={t("letterCoach.structure.label")} hint={t("letterCoach.structure.hint")} minRows={6} {...fieldProps("structure")} />
        <Section fieldKey="values" label={t("letterCoach.values.label")} hint={t("letterCoach.values.hint")} {...fieldProps("values")} />
        <Section fieldKey="strengths" label={t("letterCoach.strengths.label")} hint={t("letterCoach.strengths.hint")} {...fieldProps("strengths")} />
        <Section fieldKey="phrases" label={t("letterCoach.phrases.label")} hint={t("letterCoach.phrases.hint")} {...fieldProps("phrases")} />
        <Section fieldKey="styleRules" label={t("letterCoach.styleRules.label")} hint={t("letterCoach.styleRules.hint")} {...fieldProps("styleRules")} />
        <Section fieldKey="noGos" label={t("letterCoach.noGos.label")} hint={t("letterCoach.noGos.hint")} {...fieldProps("noGos")} />
        <Section fieldKey="referenceLetter" label={t("letterCoach.referenceLetter.label")} hint={t("letterCoach.referenceLetter.hint")} minRows={6} {...fieldProps("referenceLetter")} />

        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: saved ? "var(--accent)" : "var(--fg-3)", marginTop: 4 }}>
          <SendMail width={12} height={12} />
          {saved ? t("letterCoach.saved") : t("letterCoach.autosave")}
        </div>
      </div>
    </>
  );
}

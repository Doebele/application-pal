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
  humanize?: boolean; // undefined = on
};

// String (free-text) fields only — excludes the boolean `humanize` toggle
type StrKey = Exclude<keyof LetterConfig, "humanize">;
const FIELD_KEYS: StrKey[] = ["structure", "values", "strengths", "phrases", "styleRules", "noGos", "referenceLetter"];

const DEFAULTS: Record<Exclude<StrKey, "referenceLetter">, string> = {
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

// Persona "schulabgaenger": defaults for Schnupperlehre / Lehrstelle letters. The tone per
// kind (curious vs. confident) comes from the backend rules — these cover both.
type DefaultKey = Exclude<StrKey, "referenceLetter">;
const SCHOOL_DEFAULTS: Record<DefaultKey, string> = {
  structure:
    "1. Einleitung: worauf ich mich bewerbe (Schnupperlehre oder Lehrstelle, Beruf) und woher ich den Betrieb kenne\n" +
    "2. Warum dieser Beruf: was mich daran reizt, mit einem konkreten Erlebnis\n" +
    "3. Warum dieser Betrieb: ein Projekt, Produkt oder die Philosophie des Betriebs — zeigt, dass ich recherchiert habe\n" +
    "4. Was ich mitbringe: Schule, Hobbys, Projekte, Ämtli — jede Stärke mit einem Beispiel\n" +
    "5. Schluss: Bitte um Schnuppertage bzw. ein Gespräch, freundlich und nicht unterwürfig\n" +
    "Länge: höchstens eine halbe A4-Seite.",
  values: "",
  strengths: "",
  phrases: "",
  styleRules:
    "Einfache, klare Sätze, ehrlich und persönlich. Erster Satz direkt: \"Ich bewerbe mich um …\". " +
    "Den Betrieb beim Namen nennen, nicht nur \"Ihr Unternehmen\". Stärken mit Beispielen zeigen statt behaupten. " +
    "Schweizer Rechtschreibung (ss statt ß), kein Wort auffällig oft wiederholen.",
  noGos:
    "\"Hiermit bewerbe ich mich mit grossem Interesse\", \"Hiermit möchte ich …\", \"Ich bin ein fleissiger Mitarbeiter\", " +
    "Selbstbewertungen ohne Beispiel (\"ich bin kreativ und teamfähig\"), den Lebenslauf nacherzählen, private Gründe ohne Bezug zur Motivation.",
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

function Section({ fieldKey, label, hint, value, onChange, onBlur, minRows, defaults = DEFAULTS, placeholder }: {
  fieldKey: StrKey;
  defaults?: Record<DefaultKey, string>;
  placeholder?: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  minRows?: number;
}) {
  const { t } = useTranslation();
  const hasDefault = fieldKey !== "referenceLetter" && defaults[fieldKey].trim().length > 0;
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <div className="eyebrow" style={{ flex: 1 }}>{label}</div>
        {hasDefault && !value.trim() && (
          <button
            className="btn btn-ghost"
            style={{ fontSize: 11, padding: "3px 8px" }}
            onClick={() => { onChange(defaults[fieldKey as DefaultKey]); onBlur(); }}
          >
            {t("letterCoach.useDefault")}
          </button>
        )}
      </div>
      <div style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 8, lineHeight: 1.5 }}>{hint}</div>
      <AutoResizeTextarea value={value} onChange={onChange} onBlur={onBlur} minRows={minRows} placeholder={placeholder} />
    </div>
  );
}

export function LetterCoachPage() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<LetterConfig>({});
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [persona, setPersona] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ letterConfig?: string | null; persona?: string | null }>("/api/profile")
      .then(r => {
        setPersona(r.data.persona ?? null);
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

  const fieldProps = (key: StrKey) => ({
    value: (config[key] as string) ?? "",
    onChange: (v: string) => setConfig(c => ({ ...c, [key]: v })),
    onBlur: () => save({ [key]: config[key] ?? "" }),
  });

  const school = persona === "schulabgaenger";
  const defaults = school ? SCHOOL_DEFAULTS : DEFAULTS;
  // School leavers: "values" = motivation, "strengths" = strength → example pairs
  const k = (field: string) => school && t(`letterCoach.school.${field}`, { defaultValue: "" }) ? `letterCoach.school.${field}` : `letterCoach.${field}`;

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
            {t(k("infoText"))}
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

        {/* Humanizer toggle — global, applies to all AI-generated prose in the correspondence language */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 8, border: "1px solid var(--border)", marginBottom: 28 }}>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>{t("letterCoach.humanize.label")}</div>
            <div style={{ fontSize: 12, color: "var(--fg-3)", lineHeight: 1.5 }}>{t("letterCoach.humanize.hint")}</div>
          </div>
          <button
            role="switch"
            aria-checked={config.humanize !== false}
            onClick={() => save({ humanize: config.humanize === false })}
            style={{
              flexShrink: 0, marginTop: 2, width: 38, height: 22, borderRadius: 999, border: "none", cursor: "pointer",
              background: config.humanize !== false ? "var(--accent)" : "var(--surface-2)",
              position: "relative", transition: "background 0.15s",
            }}
          >
            <span style={{
              position: "absolute", top: 2, left: config.humanize !== false ? 18 : 2,
              width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.15s",
            }} />
          </button>
        </div>

        <Section defaults={defaults} fieldKey="structure" label={t("letterCoach.structure.label")} hint={t(k("structure.hint"))} minRows={6} {...fieldProps("structure")} />
        {school && (
          <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 8, border: "1px solid var(--border)", marginBottom: 28, fontSize: 12, color: "var(--fg-2)", lineHeight: 1.6 }}>
            <ProfileCircle width={16} height={16} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
            <div>
              {t("letterCoach.school.movedToProfile")}{" "}
              <Link to="/profile" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>{t("letterCoach.linkProfile")}</Link>
            </div>
          </div>
        )}
        {/* School leavers keep motivation + strengths in the pupil profile; old coach text stays visible until emptied */}
        {(!school || config.values?.trim()) && (
          <Section defaults={defaults} fieldKey="values" label={t(k("values.label"))} hint={t(k("values.hint"))} placeholder={school ? t("letterCoach.school.values.placeholder") : undefined} {...fieldProps("values")} />
        )}
        {(!school || config.strengths?.trim()) && (
          <Section defaults={defaults} fieldKey="strengths" label={t(k("strengths.label"))} hint={t(k("strengths.hint"))} placeholder={school ? t("letterCoach.school.strengths.placeholder") : undefined} {...fieldProps("strengths")} />
        )}
        <Section defaults={defaults} fieldKey="phrases" label={t("letterCoach.phrases.label")} hint={t("letterCoach.phrases.hint")} {...fieldProps("phrases")} />
        <Section defaults={defaults} fieldKey="styleRules" label={t("letterCoach.styleRules.label")} hint={t("letterCoach.styleRules.hint")} {...fieldProps("styleRules")} />
        <Section defaults={defaults} fieldKey="noGos" label={t("letterCoach.noGos.label")} hint={t("letterCoach.noGos.hint")} {...fieldProps("noGos")} />
        <Section defaults={defaults} fieldKey="referenceLetter" label={t("letterCoach.referenceLetter.label")} hint={t("letterCoach.referenceLetter.hint")} minRows={6} {...fieldProps("referenceLetter")} />

        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: saved ? "var(--accent)" : "var(--fg-3)", marginTop: 4 }}>
          <SendMail width={12} height={12} />
          {saved ? t("letterCoach.saved") : t("letterCoach.autosave")}
        </div>
      </div>
    </>
  );
}

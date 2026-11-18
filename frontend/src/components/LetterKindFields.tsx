// Kind of application (Stelle / Schnupperlehre / Lehrstelle / Praktikum), apprenticeship
// title and the contact's salutation. Used in the Details tab and on top of the letter
// workspace. Kind + apprenticeship show only for the school-leaver persona or once set.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Application } from "@application-pal/shared";
import { api } from "../lib/api";

export const APPLICATION_KINDS = ["job", "schnupperlehre", "lehrstelle", "praktikum"] as const;

const selectStyle: React.CSSProperties = {
  width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)",
  background: "var(--surface-2)", color: "var(--fg-1)", fontSize: 12, fontFamily: "var(--font-sans)", outline: "none",
};

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

/** Mirror of buildSalutation() in backend/src/letter-kinds.ts — keep in sync. */
export function buildSalutation(lang: string | null | undefined, name: string | null | undefined, gender: string | null | undefined): string {
  const l = lang === "en" || lang === "fr" ? lang : "de";
  const n = (name ?? "").trim().replace(/^(frau|herr|herrn|mrs?\.?|ms\.?|madame|monsieur)\s+/i, "");
  if (!n) return { de: "Sehr geehrte Damen und Herren", en: "Dear Sir or Madam", fr: "Madame, Monsieur," }[l];
  if (gender === "f") return { de: `Sehr geehrte Frau ${lastName(n)}`, en: `Dear Ms ${lastName(n)}`, fr: "Madame," }[l];
  if (gender === "m") return { de: `Sehr geehrter Herr ${lastName(n)}`, en: `Dear Mr ${lastName(n)}`, fr: "Monsieur," }[l];
  if (gender === "x") return { de: `Guten Tag ${n}`, en: `Dear ${n}`, fr: `Bonjour ${n},` }[l];
  return "";
}

export function usePersona(): string | null {
  const { data = null } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await api.get<{ persona?: string | null }>("/api/profile")).data,
    select: (p: { persona?: string | null }) => p.persona ?? null,
  });
  return data;
}

/** Kind + apprenticeship (school leavers). Renders nothing for other personas unless a kind is set. */
export function ApplicationKindFields({ app, onSave }: { app: Application; onSave: (patch: Partial<Application>) => void }) {
  const { t } = useTranslation();
  const persona = usePersona();
  const [kind, setKind] = useState(app.applicationKind ?? "");
  const [apprenticeship, setApprenticeship] = useState(app.apprenticeship ?? "");
  if (persona !== "schulabgaenger" && !app.applicationKind) return null;
  const school = kind === "schnupperlehre" || kind === "lehrstelle";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div className="field">
        <label>{t("letterKind.kind")}</label>
        <select value={kind || "job"} style={selectStyle}
          onChange={e => { const v = e.target.value === "job" ? "" : e.target.value; setKind(v); onSave({ applicationKind: v || null }); }}>
          {APPLICATION_KINDS.map(k => <option key={k} value={k}>{t(`letterKind.kinds.${k}`)}</option>)}
        </select>
        {school && <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 4, lineHeight: 1.4 }}>{t(`letterKind.focus.${kind}`)}</div>}
      </div>
      <div className="field">
        <label>{t("letterKind.apprenticeship")}</label>
        <input value={apprenticeship} placeholder={t("letterKind.apprenticeshipPlaceholder")}
          onChange={e => setApprenticeship(e.target.value)}
          onBlur={() => onSave({ apprenticeship: apprenticeship.trim() || null })} />
      </div>
    </div>
  );
}

/** Salutation picker for the contact person, with a live preview of the exact line. */
export function SalutationField({ app, onSave, compact }: { app: Application; onSave: (patch: Partial<Application>) => void; compact?: boolean }) {
  const { t } = useTranslation();
  const [gender, setGender] = useState(app.contactGender ?? "");
  const lang = app.language ?? "de";
  const preview = buildSalutation(lang, app.contactPerson, gender || null);
  return (
    <div className="field">
      <label>{t("letterKind.salutation")}</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {app.contactPerson?.trim() && (
          <select value={gender} style={{ ...selectStyle, width: compact ? 150 : 170, flexShrink: 0 }}
            onChange={e => { setGender(e.target.value); onSave({ contactGender: e.target.value || null }); }}>
            <option value="">{t("letterKind.genderUnknown")}</option>
            <option value="f">{t("letterKind.genderF")}</option>
            <option value="m">{t("letterKind.genderM")}</option>
            <option value="x">{t("letterKind.genderX")}</option>
          </select>
        )}
        <span style={{ fontSize: 12, color: preview ? "var(--fg-2)" : "var(--fg-4)", fontStyle: preview ? "normal" : "italic" }}>
          {preview || t("letterKind.salutationPick")}
        </span>
      </div>
    </div>
  );
}

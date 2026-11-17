// Guided questions in the letter workspace for Schnupperlehre / Lehrstelle / Praktikum.
// Answers are per application (aiResultsCache["letter-inputs"].school) and go to the
// letter prompt as binding facts (formatSchoolAnswers in backend/src/letter-kinds.ts).
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { Application } from "@application-pal/shared";
import { useSchoolProfile, type SchoolProfile } from "./SchoolProfileSection";

export type SchoolAnswers = {
  knownFrom?: string;
  whyJob?: string;
  whyCompany?: string;
  experiences?: string[];
  schnupperHere?: "yes" | "no" | "";
  schnupperNotes?: string;
};

const KNOWN_FROM = ["posting", "website", "fair", "family", "taster", "counselling"] as const;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(efz|eba|cfc|afp)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
/** Mirror of sameTrade() in backend/src/letter-kinds.ts. */
function sameTrade(a: string, b: string): boolean {
  const x = norm(a).split(" ")[0] ?? "", y = norm(b).split(" ")[0] ?? "";
  if (x.length < 4 || y.length < 4) return false;
  const stem = (w: string) => w.replace(/(in|innen|e|er)$/, "");
  return stem(x) === stem(y) || x.startsWith(y) || y.startsWith(x);
}
const sameCompany = (a: string, b: string) => { const x = norm(a), y = norm(b); return !!x && !!y && (x.includes(y) || y.includes(x)); };

/** Lines the pupil can tick as "what I bring": experiences and strengths that have an example. */
function bringOptions(p: SchoolProfile, t: (k: string) => string): string[] {
  const out: string[] = [];
  for (const e of p.experiences ?? []) {
    const parts = [`${t(`school.exp.kinds.${e.kind}`)}: ${e.title}`];
    if (e.company) parts[0] += ` (${e.company})`;
    if (e.what) parts.push(e.what);
    if (e.liked) parts.push(e.liked);
    out.push(parts.join(" — "));
  }
  for (const s of p.strengths ?? []) if (s.example?.trim()) out.push(`${s.strength} → ${s.example}`);
  return out;
}

export function SchoolLetterQuestions({ app, value, onChange, onCommit, inputStyle, labelStyle }: {
  app: Application;
  value: SchoolAnswers;
  onChange: (patch: Partial<SchoolAnswers>, persist?: boolean) => void;
  onCommit: () => void;
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
}) {
  const { t } = useTranslation();
  const profile = useSchoolProfile();
  const kind = app.applicationKind;
  const wishJobs = profile.wishJobs ?? [];
  const matching = app.apprenticeship ? wishJobs.filter(w => sameTrade(w.title, app.apprenticeship!)) : [];
  const options = bringOptions(profile, t);
  const picked = new Set(value.experiences ?? []);
  const schnupperHere = (profile.experiences ?? []).find(e => e.kind === "schnupper" && e.company && sameCompany(e.company, app.company));
  const profileEmpty = !wishJobs.length && !options.length;

  const chip = (active: boolean): React.CSSProperties => ({
    fontSize: 11, padding: "3px 9px", borderRadius: 999, cursor: "pointer",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "var(--accent-08)" : "transparent", color: active ? "var(--accent)" : "var(--fg-2)",
  });

  return (
    <div style={{ display: "grid", gap: 16, marginBottom: 20 }}>
      {profileEmpty && (
        <div style={{ fontSize: 12, color: "var(--fg-2)", lineHeight: 1.5, padding: "8px 10px", borderRadius: 8, background: "var(--accent-08)", border: "1px solid var(--accent-15)" }}>
          {t("schoolLetter.profileEmpty")}{" "}
          <Link to="/profile" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>{t("letterCoach.linkProfile")}</Link>
        </div>
      )}

      <div>
        <div style={labelStyle}>{t("schoolLetter.knownFrom")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          {KNOWN_FROM.map(k => {
            const label = t(`schoolLetter.knownFromOptions.${k}`);
            return <button key={k} type="button" style={chip(value.knownFrom === label)} onClick={() => onChange({ knownFrom: label }, true)}>{label}</button>;
          })}
        </div>
        <input value={value.knownFrom ?? ""} placeholder={t("schoolLetter.knownFromPlaceholder")} style={inputStyle}
          onChange={e => onChange({ knownFrom: e.target.value })} onBlur={onCommit} />
      </div>

      <div>
        <div style={labelStyle}>{t("schoolLetter.whyJob")}</div>
        {wishJobs.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
            {(matching.length ? matching : wishJobs).map((w, i) => (
              <button key={i} type="button" style={chip(false)}
                onClick={() => onChange({ whyJob: [w.why, w.since && `${t("schoolLetter.noticed")}: ${w.since}`].filter(Boolean).join(" — ") }, true)}>
                {t("schoolLetter.fromProfile", { job: w.title })}
              </button>
            ))}
          </div>
        )}
        <textarea value={value.whyJob ?? ""} rows={2} placeholder={t("schoolLetter.whyJobPlaceholder")} style={inputStyle}
          onChange={e => onChange({ whyJob: e.target.value })} onBlur={onCommit} />
      </div>

      <div>
        <div style={labelStyle}>{t("schoolLetter.whyCompany")}</div>
        <textarea value={value.whyCompany ?? ""} rows={2} placeholder={t("schoolLetter.whyCompanyPlaceholder", { company: app.company })} style={inputStyle}
          onChange={e => onChange({ whyCompany: e.target.value })} onBlur={onCommit} />
        <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 4 }}>{t("schoolLetter.whyCompanyHint")}</div>
      </div>

      {options.length > 0 && (
        <div>
          <div style={labelStyle}>{t("schoolLetter.bring")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {options.map(o => (
              <label key={o} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "var(--fg-2)", lineHeight: 1.5, padding: "4px 6px", borderRadius: 6, background: picked.has(o) ? "var(--accent-08)" : "transparent", cursor: "pointer" }}>
                <input type="checkbox" checked={picked.has(o)} style={{ marginTop: 3 }}
                  onChange={() => {
                    const next = picked.has(o) ? [...picked].filter(x => x !== o) : [...picked, o];
                    onChange({ experiences: next }, true);
                  }} />
                {o}
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 4 }}>{t("schoolLetter.bringHint")}</div>
        </div>
      )}

      {kind === "lehrstelle" && (
        <div>
          <div style={labelStyle}>{t("schoolLetter.schnupperHere", { company: app.company })}</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            {(["yes", "no"] as const).map(v => (
              <button key={v} type="button" style={chip(value.schnupperHere === v)}
                onClick={() => {
                  const patch: Partial<SchoolAnswers> = { schnupperHere: value.schnupperHere === v ? "" : v };
                  // Prefill from a taster in this company recorded in the profile
                  if (v === "yes" && !value.schnupperNotes?.trim() && schnupperHere) {
                    patch.schnupperNotes = [schnupperHere.what, schnupperHere.liked].filter(Boolean).join(" — ");
                  }
                  onChange(patch, true);
                }}>
                {t(`schoolLetter.${v}`)}
              </button>
            ))}
          </div>
          {value.schnupperHere === "yes" && (
            <textarea value={value.schnupperNotes ?? ""} rows={2} placeholder={t("schoolLetter.schnupperNotesPlaceholder")} style={inputStyle}
              onChange={e => onChange({ schnupperNotes: e.target.value })} onBlur={onCommit} />
          )}
          <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 4 }}>{t("schoolLetter.schnupperHint")}</div>
        </div>
      )}
    </div>
  );
}

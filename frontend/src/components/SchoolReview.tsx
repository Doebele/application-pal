// School-leaver part of the letter review: the four criteria the company looks for (model)
// and the deterministic checklist (schoolLetterChecks in backend/src/letter-kinds.ts).
import { useTranslation } from "react-i18next";
import { Check, WarningTriangle, Xmark, Minus } from "iconoir-react";

type Level = "strong" | "ok" | "weak";
type Criterion = { stufe?: string; begruendung?: string; tipp?: string };
export type SchoolReviewData = {
  kriterien?: Partial<Record<"motivation" | "passung" | "zuverlaessigkeit" | "persoenlichkeit", Criterion>>;
  rechtschreibung?: { fehler?: string; korrektur?: string }[];
  checks?: { id: string; status: "ok" | "warn" | "fail" | "na"; params?: Record<string, string | number> }[];
};

const CRITERIA = ["motivation", "passung", "zuverlaessigkeit", "persoenlichkeit"] as const;
const LEVEL_COLOR: Record<Level, string> = { strong: "var(--score-high)", ok: "var(--score-mid)", weak: "var(--score-low)" };
const STATUS_COLOR = { ok: "var(--score-high)", warn: "var(--score-mid)", fail: "var(--score-low)", na: "var(--fg-4)" } as const;

function StatusIcon({ status }: { status: "ok" | "warn" | "fail" | "na" }) {
  const p = { width: 12, height: 12, style: { color: STATUS_COLOR[status], flexShrink: 0, marginTop: 2 } };
  return status === "ok" ? <Check {...p} /> : status === "warn" ? <WarningTriangle {...p} /> : status === "fail" ? <Xmark {...p} /> : <Minus {...p} />;
}

export function SchoolReview({ data, labelStyle }: { data: SchoolReviewData; labelStyle: React.CSSProperties }) {
  const { t } = useTranslation();
  const crit = data.kriterien ?? {};
  const hasCrit = CRITERIA.some(c => crit[c]);
  const checks = data.checks ?? [];
  const spelling = (data.rechtschreibung ?? []).filter(s => s.fehler?.trim());
  const open = checks.filter(c => c.status === "fail" || c.status === "warn").length;

  return (
    <div style={{ display: "grid", gap: 14, marginBottom: 14 }}>
      {hasCrit && (
        <div>
          <div style={labelStyle}>{t("schoolReview.criteriaTitle")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {CRITERIA.map(c => {
              const k = crit[c];
              if (!k) return null;
              const lvl = (["strong", "ok", "weak"].includes(k.stufe ?? "") ? k.stufe : "ok") as Level;
              return (
                <div key={c} style={{ border: "1px solid var(--border)", borderLeft: `3px solid ${LEVEL_COLOR[lvl]}`, borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-1)" }}>{t(`schoolReview.criteria.${c}`)}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: LEVEL_COLOR[lvl], textTransform: "uppercase", letterSpacing: "0.05em" }}>{t(`schoolReview.levels.${lvl}`)}</span>
                  </div>
                  {k.begruendung && <div style={{ fontSize: 11.5, color: "var(--fg-2)", lineHeight: 1.5 }}>{k.begruendung}</div>}
                  {k.tipp && lvl !== "strong" && <div style={{ fontSize: 11.5, color: "var(--fg-3)", lineHeight: 1.5, marginTop: 3 }}><strong>{t("schoolReview.tip")}:</strong> {k.tipp}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {checks.length > 0 && (
        <div>
          <div style={labelStyle}>
            {t("schoolReview.checklistTitle")}{" "}
            <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0, color: open ? "var(--score-mid)" : "var(--score-high)" }}>
              · {open ? t("schoolReview.openCount", { count: open }) : t("schoolReview.allOk")}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {checks.filter(c => c.status !== "na").map(c => (
              <div key={c.id} style={{ display: "flex", gap: 7, fontSize: 12, lineHeight: 1.5, color: c.status === "ok" ? "var(--fg-3)" : "var(--fg-1)" }}>
                <StatusIcon status={c.status} />
                <span>{t(`schoolReview.checks.${c.id}.${c.status}`, { ...(c.params ?? {}), defaultValue: t(`schoolReview.checks.${c.id}.label`) })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {spelling.length > 0 && (
        <div>
          <div style={labelStyle}>{t("schoolReview.spellingTitle")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {spelling.map((s, i) => (
              <div key={i} style={{ fontSize: 12, color: "var(--fg-2)" }}>
                <span style={{ textDecoration: "line-through", color: "var(--score-low)" }}>{s.fehler}</span>
                {s.korrektur && <> → <strong style={{ color: "var(--score-high)" }}>{s.korrektur}</strong></>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

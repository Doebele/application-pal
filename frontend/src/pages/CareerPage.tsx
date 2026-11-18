// "Berufswahl" (route /career, rail entry for school leavers, phase 5e): a short interest check plus
// ideas for trades from GET /api/career/suggestions. The backend matches interests, favourite
// subjects, strengths WITH an example and strong test results only — weak results never count.
// Ideas, never a verdict: every card shows its reasons, and the page points to the Berufsberatung.
// Interests are stored in school_profile.interests (merge-save via PATCH /api/profile).
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Compass, Plus, Check, OpenNewWindow, InfoCircle } from "iconoir-react";
import { Topbar } from "../components/Topbar";
import { api } from "../lib/api";

const AREAS = ["build", "tech", "vehicles", "it", "nature", "outdoor", "care", "health", "sales", "office", "creative", "food", "lab", "logistics"] as const;
type Area = typeof AREAS[number];
type Rating = 0 | 1 | 2;

type Reason =
  | { type: "wish"; title: string }
  | { type: "interest"; area: Area; rating: Rating; primary: boolean }
  | { type: "subject"; skill: string }
  | { type: "test"; skill: string; test: string; area: string; level: "high" | "above" }
  | { type: "strength"; trait: string; strength: string; example: string };
type Suggestion = {
  id: string; name: { de: string; fr: string; en: string }; level: "EFZ" | "EBA"; years: number;
  searchTerm: { de: string; fr: string }; fit: "strong" | "good" | "possible"; score: number; reasons: Reason[]; isWish: boolean;
};
type CareerResult = { suggestions: Suggestion[]; missing: ("interests" | "subjects" | "strengths" | "examples")[]; strengthsWithoutExample: number };
type Profile = { schoolProfile?: string | null };

const FIT_COLOR: Record<Suggestion["fit"], string> = { strong: "var(--score-high)", good: "var(--score-mid)", possible: "var(--fg-3)" };

function readSp(raw: string | null | undefined): Record<string, unknown> {
  try { const j = JSON.parse(raw ?? "{}"); return j && typeof j === "object" ? j : {}; } catch { return {}; }
}

export function CareerPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const lang = ((i18n.language || "de").slice(0, 2)) as "de" | "fr" | "en";

  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: async () => (await api.get<Profile>("/api/profile")).data });
  const { data, isLoading } = useQuery({
    queryKey: ["career"],
    queryFn: async () => (await api.get<CareerResult>("/api/career/suggestions")).data,
  });

  const sp = readSp(profile?.schoolProfile);
  const interests = (sp.interests && typeof sp.interests === "object" ? sp.interests : {}) as Partial<Record<Area, Rating>>;
  const wishTitles = (Array.isArray(sp.wishJobs) ? sp.wishJobs : []).map(w => String((w as { title?: string })?.title ?? "").toLowerCase());

  const saveSp = async (patch: Record<string, unknown>) => {
    const latest = (qc.getQueryData(["profile"]) as Profile | undefined) ?? profile;
    const schoolProfile = JSON.stringify({ ...readSp(latest?.schoolProfile), ...patch });
    qc.setQueryData(["profile"], { ...(latest ?? {}), schoolProfile });
    await api.patch("/api/profile", { schoolProfile }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["career"] });
  };
  const rate = (area: Area, r: Rating) => {
    const latest = readSp(((qc.getQueryData(["profile"]) as Profile | undefined) ?? profile)?.schoolProfile);
    const cur = (latest.interests && typeof latest.interests === "object" ? latest.interests : {}) as Record<string, Rating>;
    void saveSp({ interests: { ...cur, [area]: r } });
  };
  const addWish = (s: Suggestion) => {
    const latest = readSp(((qc.getQueryData(["profile"]) as Profile | undefined) ?? profile)?.schoolProfile);
    const jobs = Array.isArray(latest.wishJobs) ? latest.wishJobs : [];
    void saveSp({ wishJobs: [...jobs, { title: s.name[lang] ?? s.name.de }] });
  };

  const reasonText = (r: Reason): string => {
    switch (r.type) {
      case "wish": return t("career.reasons.wish");
      case "interest": return r.primary
        ? t(r.rating === 2 ? "career.reasons.interestStrong" : "career.reasons.interest", { area: t(`career.areas.${r.area}.title`) })
        : t("career.reasons.interestAlso", { area: t(`career.areas.${r.area}.title`) });
      case "subject": return t("career.reasons.subject", { subject: t(`career.skills.${r.skill}`) });
      case "test": return t(`career.reasons.test_${r.level}`, { test: r.test, area: r.area });
      case "strength": return t("career.reasons.strength", { strength: r.strength, example: r.example });
    }
  };
  const reasonColor = (r: Reason) => r.type === "wish" ? "var(--accent)" : r.type === "interest" ? "var(--fg-2)" : "var(--score-high)";

  const infoUrl = (s: Suggestion) => lang === "fr"
    ? `https://www.orientation.ch/fr/recherche?searchTerm=${encodeURIComponent(s.searchTerm.fr)}`
    : `https://www.berufsberatung.ch/de/suche?searchTerm=${encodeURIComponent(s.searchTerm.de)}`;

  const suggestions = data?.suggestions ?? [];
  const rated = AREAS.filter(a => (interests[a] ?? -1) >= 0).length;

  return (
    <>
      <Topbar title={t("career.title")} sub={t("career.sub")} />
      <div className="split-scroll" style={{ gridTemplateColumns: "minmax(300px, 1fr) minmax(340px, 1.4fr)" }}>
        {/* ── Interest check ── */}
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{t("career.interestsTitle")}</div>
          <div style={{ fontSize: 12, color: "var(--fg-3)", lineHeight: 1.5, marginBottom: 12 }}>
            {t("career.interestsIntro")} <span style={{ color: "var(--fg-4)" }}>({t("career.rated", { n: rated, total: AREAS.length })})</span>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {AREAS.map(a => (
              <div key={a} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)" }}>{t(`career.areas.${a}.title`)}</div>
                  <div style={{ fontSize: 11.5, color: "var(--fg-3)", lineHeight: 1.35 }}>{t(`career.areas.${a}.hint`)}</div>
                </div>
                <div role="radiogroup" aria-label={t(`career.areas.${a}.title`)} style={{ display: "flex", gap: 3 }}>
                  {([0, 1, 2] as Rating[]).map(r => {
                    const on = interests[a] === r;
                    return (
                      <button key={r} role="radio" aria-checked={on} onClick={() => rate(a, r)} className="btn btn-ghost"
                        style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                          background: on ? "var(--accent)" : "transparent", color: on ? "var(--accent-fg, #fff)" : "var(--fg-2)", fontWeight: on ? 700 : 500 }}>
                        {t(`career.rating.${r}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Ideas ── */}
        <div>
          <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 12, color: "var(--fg-2)", lineHeight: 1.5, marginBottom: 14 }}>
            <InfoCircle width={15} height={15} style={{ flexShrink: 0, marginTop: 1, color: "var(--accent)" }} />
            <span>{t("career.disclaimer")}{" "}
              <a href={lang === "fr" ? "https://www.orientation.ch/fr" : "https://www.berufsberatung.ch"} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{t("career.counselling")}</a>
            </span>
          </div>

          {data && data.missing.length > 0 && (
            <div style={{ display: "grid", gap: 4, marginBottom: 14 }}>
              {data.missing.map(m => (
                <div key={m} style={{ fontSize: 11.5, color: "var(--fg-3)" }}>
                  · {t(`career.missing.${m}`, { n: data.strengthsWithoutExample })}{" "}
                  {m !== "interests" && <button className="btn btn-ghost" style={{ fontSize: 11.5, padding: 0, color: "var(--accent)" }} onClick={() => navigate("/profile")}>{t("career.toProfile")}</button>}
                </div>
              ))}
            </div>
          )}

          <div className="eyebrow" style={{ marginBottom: 8 }}>{t("career.ideasTitle")}</div>
          {isLoading && <div style={{ fontSize: 12, color: "var(--fg-3)" }}>…</div>}
          {!isLoading && !suggestions.length && (
            <div style={{ border: "1px dashed var(--border)", borderRadius: 10, padding: 20, fontSize: 13, color: "var(--fg-3)", textAlign: "center" }}>
              <Compass width={18} height={18} style={{ marginBottom: 6 }} /><br />{t("career.empty")}
            </div>
          )}
          <div style={{ display: "grid", gap: 10 }}>
            {suggestions.map(s => {
              const onList = s.isWish || [s.name.de, s.name.fr, s.name.en].some(n => wishTitles.includes(n.toLowerCase()));
              return (
                <div key={s.id} style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-1, var(--surface-2))" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg-1)" }}>{s.name[lang] ?? s.name.de}</div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: FIT_COLOR[s.fit] }}>{t(`career.fit.${s.fit}`)}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--fg-3)", marginBottom: 8 }}>
                    {t(`career.levels.${s.level}`)} · {t("career.years", { count: s.years })}
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16, display: "grid", gap: 2 }}>
                    {s.reasons.map((r, i) => (
                      <li key={i} style={{ fontSize: 12, color: reasonColor(r), lineHeight: 1.45 }}>{reasonText(r)}</li>
                    ))}
                  </ul>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    {onList
                      ? <span style={{ fontSize: 11.5, color: "var(--score-high)", display: "inline-flex", gap: 4, alignItems: "center" }}><Check width={12} height={12} /> {t("career.onWishList")}</span>
                      : <button className="btn btn-secondary" style={{ fontSize: 11.5, gap: 4, padding: "3px 8px" }} onClick={() => addWish(s)}><Plus width={11} height={11} /> {t("career.addWish")}</button>}
                    <a className="btn btn-ghost" style={{ fontSize: 11.5, gap: 4, padding: "3px 8px" }} href={infoUrl(s)} target="_blank" rel="noreferrer">
                      <OpenNewWindow width={11} height={11} /> {t("career.info")}
                    </a>
                    <a className="btn btn-ghost" style={{ fontSize: 11.5, gap: 4, padding: "3px 8px" }} href={lang === "fr" ? "https://www.yousty.ch/fr-CH/places-d-apprentissage" : "https://www.yousty.ch/de-CH/lehrstellen"} target="_blank" rel="noreferrer"
                      title={t("career.searchHint", { term: lang === "fr" ? s.searchTerm.fr : s.searchTerm.de })}>
                      <OpenNewWindow width={11} height={11} /> Yousty
                    </a>
                    <a className="btn btn-ghost" style={{ fontSize: 11.5, gap: 4, padding: "3px 8px" }} href={lang === "fr" ? "https://www.orientation.ch/fr/accueil-recherche/apprentissages" : "https://www.berufsberatung.ch/de/start-suche/lehrstellen"} target="_blank" rel="noreferrer"
                      title={t("career.searchHint", { term: lang === "fr" ? s.searchTerm.fr : s.searchTerm.de })}>
                      <OpenNewWindow width={11} height={11} /> LENA
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

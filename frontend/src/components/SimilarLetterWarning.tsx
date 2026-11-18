// Amber note under the letter when it is nearly the same as the current letter of another
// application (GET /api/applications/:id/letter-similarity, letterSimilarity() in
// backend/src/letter-kinds.ts). Companies notice copy-paste letters.
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { WarningTriangle } from "iconoir-react";
import { api } from "../lib/api";
import { useUiStore } from "../lib/store";

type Similar = { id: string; company: string; role: string; pct: number };

export function SimilarLetterWarning({ appId, body }: { appId: string; body: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSelected = useUiStore(s => s.setSelectedApplicationId);
  const { data } = useQuery({
    // Keyed on the stored letter, so a new or edited version is compared again
    queryKey: ["letter-similarity", appId, body.length, body.slice(0, 40), body.slice(-40)],
    queryFn: async () => (await api.get<{ similar: Similar[] }>(`/api/applications/${appId}/letter-similarity`)).data.similar,
    enabled: body.trim().length > 0,
    staleTime: 60_000,
  });
  const top = data?.[0];
  if (!top) return null;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, lineHeight: 1.5, color: "var(--fg-1)", padding: "8px 10px", borderRadius: 8, marginBottom: 10, background: "var(--score-mid-bg)", border: "1px solid var(--score-mid-border)" }}>
      <WarningTriangle width={13} height={13} style={{ color: "var(--score-mid)", flexShrink: 0, marginTop: 2 }} />
      <span>
        {t("similarLetter.warning", { pct: top.pct })}{" "}
        <button type="button" style={{ font: "inherit", fontWeight: 600, color: "var(--fg-1)", textDecoration: "underline", background: "none", border: "none", padding: 0, cursor: "pointer" }}
          onClick={() => { setSelected(top.id); navigate("/"); }}>
          {top.company}
        </button>
        {data!.length > 1 && <> {t("similarLetter.more", { count: data!.length - 1 })}</>}
        {" "}{t("similarLetter.tip")}
      </span>
    </div>
  );
}

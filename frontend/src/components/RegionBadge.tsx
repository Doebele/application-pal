// Region check (phase 5d): how far a Lehrstelle is from the pupil's home. The level comes from
// postcodes / towns only (no external call); the ÖV check asks transport.opendata.ch on click and
// compares the fastest weekday-morning connection with school_profile.maxCommuteMin.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { MapPin, Train, RefreshCircle } from "iconoir-react";
import { api } from "../lib/api";

export type RegionLevel = "same_town" | "near" | "region" | "far" | "unknown";
export type RegionInfo = { level: RegionLevel; home: string; job: string };
type Commute = { minutes: number; transfers: number; from: string; to: string; _savedAt?: string };

const COLOR: Record<RegionLevel, string> = {
  same_town: "var(--score-high)", near: "var(--score-high)", region: "var(--score-mid)", far: "var(--score-low)", unknown: "var(--fg-3)",
};

export const DEFAULT_MAX_COMMUTE = 60;

function maxCommuteOf(schoolProfile: string | null | undefined): number {
  try { const n = JSON.parse(schoolProfile ?? "{}")?.maxCommuteMin; return typeof n === "number" ? n : DEFAULT_MAX_COMMUTE; } catch { return DEFAULT_MAX_COMMUTE; }
}

/** Badge only — used in the import review. */
export function RegionBadge({ region }: { region: RegionInfo }) {
  const { t } = useTranslation();
  if (region.level === "unknown" && !region.home) {
    return (
      <div style={{ fontSize: 11.5, color: "var(--fg-3)", display: "flex", gap: 6, alignItems: "center" }}>
        <MapPin width={12} height={12} /> {t("region.noHome")} <Link to="/school-cv" style={{ color: "var(--accent)" }}>{t("region.setHome")}</Link>
      </div>
    );
  }
  return (
    <div style={{ fontSize: 11.5, display: "flex", gap: 6, alignItems: "center", color: "var(--fg-2)" }}>
      <MapPin width={12} height={12} style={{ color: COLOR[region.level] }} />
      <span style={{ fontWeight: 600, color: COLOR[region.level] }}>{t(`region.levels.${region.level}`)}</span>
      {region.home && region.job && <span style={{ color: "var(--fg-3)" }}>{t("region.fromTo", { home: region.home, job: region.job })}</span>}
      {region.level === "unknown" && region.home && <span style={{ color: "var(--fg-3)" }}>· {t("region.needZip")}</span>}
    </div>
  );
}

/** Badge + ÖV check for one application (drawer details). */
export function RegionCheck({ appId, location, commute }: { appId: string; location: string | null | undefined; commute?: Commute | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { data: region } = useQuery({
    queryKey: ["region", appId, location ?? ""],
    queryFn: async () => (await api.get<RegionInfo>(`/api/applications/${appId}/region`)).data,
  });
  const { data: profile } = useQuery<{ schoolProfile?: string | null }>({ queryKey: ["profile"], queryFn: () => api.get("/api/profile").then(r => r.data) });
  const max = maxCommuteOf(profile?.schoolProfile);

  const check = async () => {
    setBusy(true); setErr("");
    try {
      await api.post(`/api/applications/${appId}/commute`, {});
      qc.invalidateQueries({ queryKey: ["application", appId] });
      qc.invalidateQueries({ queryKey: ["applications"] });
    } catch (e) {
      const code = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "transport_failed";
      setErr(t(`region.errors.${code}`, { defaultValue: t("region.errors.transport_failed") }));
    } finally { setBusy(false); }
  };

  if (!region) return null;
  const tooLong = commute && commute.minutes > max;
  return (
    <div style={{ display: "grid", gap: 6, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
      <RegionBadge region={region} />
      {commute && (
        <div style={{ fontSize: 11.5, display: "flex", gap: 6, alignItems: "center", color: tooLong ? "var(--score-low)" : "var(--fg-2)" }}>
          <Train width={12} height={12} />
          <span style={{ fontWeight: 600 }}>{t("region.minutes", { count: commute.minutes })}</span>
          <span style={{ color: "var(--fg-3)" }}>
            {t("region.transfers", { count: commute.transfers })} · {commute.from} → {commute.to}
          </span>
          {tooLong && <span>· {t("region.tooLong", { max })}</span>}
        </div>
      )}
      {region.home && location && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" style={{ fontSize: 11.5, gap: 4, padding: "2px 6px" }} disabled={busy} onClick={() => void check()}
            title={t("region.privacy")}>
            {busy ? <RefreshCircle width={11} height={11} style={{ animation: "spin 1s linear infinite" }} /> : <Train width={11} height={11} />}
            {commute ? t("region.recheck") : t("region.check")}
          </button>
          <span style={{ fontSize: 10.5, color: "var(--fg-4)" }}>{t("region.privacy")}</span>
        </div>
      )}
      {err && <div style={{ fontSize: 11.5, color: "var(--score-low)" }}>{err}</div>}
    </div>
  );
}

// Reminder strip on the board (school leavers): what is due today per the reminder days
// (deadline 7/3/1/0 days before, taster days 3/1/0, interviews 1/0, tests 7/1/0 …), overdue
// deadlines and the "say thanks" nudge after taster days. Dismissed per day (browser only).
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Bell, Xmark } from "iconoir-react";
import { api } from "../lib/api";
import { type AgendaItem, localToday } from "../lib/agenda";

const KEY = "agenda-banner-dismissed";

export function AgendaBanner() {
  const { t } = useTranslation();
  const today = localToday();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === today; } catch { return false; } });
  const { data } = useQuery({
    queryKey: ["agenda", today],
    queryFn: async () => (await api.get<{ items: AgendaItem[] }>(`/api/agenda?today=${today}`)).data,
    staleTime: 5 * 60_000,
  });
  const due = (data?.items ?? []).filter(i => i.remind || i.kind === "followup" || (i.kind === "deadline" && i.urgency === "overdue"));
  if (hidden || !due.length) return null;

  const text = (it: AgendaItem) => {
    const name = it.kind === "personal" ? (it.title || t(`agenda.personalKinds.${it.sub ?? "other"}`)) : it.title;
    const kind = it.kind === "personal" ? t(`agenda.personalKinds.${it.sub ?? "other"}`) : t(`agenda.kinds.${it.kind}`);
    const when = it.kind === "followup" ? "" : it.daysLeft < 0 ? t("agenda.overdue", { count: -it.daysLeft })
      : it.daysLeft === 0 ? t("agenda.today") : it.daysLeft === 1 ? t("agenda.tomorrow") : t("agenda.inDays", { count: it.daysLeft });
    return `${kind} ${name}${when ? ` (${when})` : ""}`;
  };

  return (
    <div role="status" style={{ margin: "10px 24px 0", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--score-mid-border, var(--border))",
      background: "var(--score-mid-bg, var(--surface-2))", display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "var(--fg-1)" }}>
      <Bell width={14} height={14} style={{ color: "var(--score-mid)", flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong>{t("agenda.bannerTitle", { count: due.length })}</strong>{" "}
        {due.slice(0, 3).map(text).join(" · ")}{due.length > 3 ? " …" : ""}
      </span>
      <Link to="/dates" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>{t("agenda.bannerOpen")}</Link>
      <button className="btn btn-ghost btn-icon" style={{ padding: 3 }} aria-label={t("agenda.bannerDismiss")} title={t("agenda.bannerDismiss")}
        onClick={() => { setHidden(true); try { localStorage.setItem(KEY, today); } catch { /* ignore */ } }}>
        <Xmark width={12} height={12} />
      </button>
    </div>
  );
}

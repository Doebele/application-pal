// "Termine & Fristen" (route /dates, rail entry for school leavers): everything with a date —
// application deadlines, taster days, interviews, follow-up nudges and the pupil's own dates
// (Multicheck, Stellwerk, Berufsmesse …). Own dates live in school_profile.dates; the list and
// reminder days come from GET /api/agenda, the calendar file from GET /api/agenda/ics.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Bell, Calendar, Download, Plus, Trash, OpenNewWindow, RefreshCircle } from "iconoir-react";
import { Topbar } from "../components/Topbar";
import { api } from "../lib/api";
import { useUiStore } from "../lib/store";
import { type AgendaItem, type PersonalKind, fmtDay, googleCalendarLink, localToday } from "../lib/agenda";
import { personalDatesFromProfile, type PersonalDate } from "../lib/calendarMapping";

const PERSONAL_KINDS: PersonalKind[] = ["test", "fair", "info", "counselling", "other"];
const KIND_COLOR: Record<AgendaItem["kind"], string> = {
  deadline: "var(--score-low)", taster: "var(--stage-color-interview_1)", interview: "var(--stage-color-interview_1)",
  followup: "var(--score-mid)", personal: "var(--accent)",
};

const inp: React.CSSProperties = {
  width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-2)",
  color: "var(--fg-1)", fontSize: 12.5, fontFamily: "var(--font-sans)", outline: "none", boxSizing: "border-box",
};
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--fg-2)", marginBottom: 3 };

type Profile = { schoolProfile?: string | null };

export function AgendaPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const setSelectedApplicationId = useUiStore(s => s.setSelectedApplicationId);
  const today = localToday();
  const lang = (i18n.language || "de").slice(0, 2);

  const { data, isLoading } = useQuery({
    queryKey: ["agenda", today],
    queryFn: async () => (await api.get<{ items: AgendaItem[] }>(`/api/agenda?today=${today}`)).data,
  });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: async () => (await api.get<Profile>("/api/profile")).data });
  const personal = personalDatesFromProfile(profile?.schoolProfile).sort((a, b) => a.date.localeCompare(b.date));

  const [draft, setDraft] = useState<Omit<PersonalDate, "id">>({ kind: "test", title: "", date: "", time: "", place: "" });
  const [busy, setBusy] = useState(false);

  const saveDates = async (dates: PersonalDate[]) => {
    const latest = (qc.getQueryData(["profile"]) as Profile | undefined) ?? profile;
    let sp: Record<string, unknown> = {};
    try { sp = JSON.parse(latest?.schoolProfile ?? "{}") ?? {}; } catch { /* empty */ }
    const schoolProfile = JSON.stringify({ ...sp, dates });
    qc.setQueryData(["profile"], { ...(latest ?? {}), schoolProfile });
    await api.patch("/api/profile", { schoolProfile }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["agenda"] });
  };
  const addDate = async () => {
    if (!draft.date) return;
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const clean: PersonalDate = { id, kind: draft.kind, title: draft.title.trim(), date: draft.date,
      ...(draft.time ? { time: draft.time } : {}), ...(draft.place?.trim() ? { place: draft.place.trim() } : {}) };
    await saveDates([...personal, clean]);
    setDraft(d => ({ ...d, title: "", date: "", time: "", place: "" }));
  };

  const downloadIcs = async () => {
    setBusy(true);
    try {
      const r = await api.get(`/api/agenda/ics?today=${today}&lang=${lang}`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data as Blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${t("agenda.fileName")}.ics`; a.click();
      URL.revokeObjectURL(url);
    } finally { setBusy(false); }
  };

  const label = (it: AgendaItem) =>
    it.kind === "personal" ? (it.title || t(`agenda.personalKinds.${it.sub ?? "other"}`)) : it.title;
  const kindLabel = (it: AgendaItem) =>
    it.kind === "personal" ? t(`agenda.personalKinds.${it.sub ?? "other"}`) : t(`agenda.kinds.${it.kind}`);
  const when = (it: AgendaItem) =>
    it.kind === "followup" ? t("agenda.followupHint")
      : it.endDate && it.daysLeft === 0 && it.date < today ? t("agenda.running")
      : it.daysLeft < 0 ? t("agenda.overdue", { count: -it.daysLeft })
      : it.daysLeft === 0 ? t("agenda.today")
      : it.daysLeft === 1 ? t("agenda.tomorrow")
      : t("agenda.inDays", { count: it.daysLeft });

  const items = data?.items ?? [];
  const groups: { key: string; items: AgendaItem[] }[] = [
    { key: "overdue", items: items.filter(i => i.urgency === "overdue") },
    { key: "today", items: items.filter(i => i.urgency === "today") },
    { key: "soon", items: items.filter(i => i.urgency === "soon") },
    { key: "later", items: items.filter(i => i.urgency === "later") },
  ].filter(g => g.items.length);

  const open = (it: AgendaItem) => {
    if (!it.appId) return;
    setSelectedApplicationId(it.appId);
    navigate("/");
  };

  return (
    <>
      <Topbar title={t("agenda.title")} sub={t("agenda.sub")} actions={
        <button className="btn btn-secondary" style={{ fontSize: 12, gap: 5 }} disabled={busy || !items.length} onClick={downloadIcs} title={t("agenda.icsHint")}>
          {busy ? <RefreshCircle width={12} height={12} style={{ animation: "spin 1s linear infinite" }} /> : <Download width={12} height={12} />} {t("agenda.ics")}
        </button>
      } />
      <div className="split-scroll" style={{ gridTemplateColumns: "minmax(340px, 1.4fr) minmax(280px, 1fr)" }}>
        {/* ── Agenda ── */}
        <div>
          <div style={{ fontSize: 12, color: "var(--fg-3)", lineHeight: 1.5, marginBottom: 16 }}>{t("agenda.intro")}</div>
          {isLoading && <div style={{ fontSize: 12, color: "var(--fg-3)" }}>…</div>}
          {!isLoading && !items.length && (
            <div style={{ border: "1px dashed var(--border)", borderRadius: 10, padding: 20, fontSize: 13, color: "var(--fg-3)", textAlign: "center" }}>
              <Calendar width={18} height={18} style={{ marginBottom: 6 }} /><br />{t("agenda.empty")}
            </div>
          )}
          {groups.map(g => (
            <div key={g.key} style={{ marginBottom: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 8, color: g.key === "overdue" ? "var(--score-low)" : undefined }}>{t(`agenda.groups.${g.key}`)}</div>
              <div style={{ display: "grid", gap: 6 }}>
                {g.items.map(it => (
                  <div key={it.id} onClick={() => open(it)} role={it.appId ? "button" : undefined} tabIndex={it.appId ? 0 : undefined}
                    onKeyDown={e => { if (e.key === "Enter") open(it); }}
                    style={{ display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 12, alignItems: "center", padding: "9px 12px", borderRadius: 8,
                      border: "1px solid var(--border)", borderLeft: `3px solid ${KIND_COLOR[it.kind]}`, background: "var(--surface)", cursor: it.appId ? "pointer" : "default" }}>
                    <div style={{ fontSize: 11.5, color: "var(--fg-2)", lineHeight: 1.3 }}>
                      <div style={{ fontWeight: 700 }}>{fmtDay(it.date, lang)}</div>
                      {it.endDate && <div style={{ color: "var(--fg-3)" }}>– {fmtDay(it.endDate, lang, { day: "numeric", month: "short" })}</div>}
                      {it.time && <div style={{ color: "var(--fg-3)" }}>{it.time}</div>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: KIND_COLOR[it.kind] }}>{kindLabel(it)}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label(it)}</div>
                      <div style={{ fontSize: 11.5, color: "var(--fg-3)" }}>{[it.detail, when(it)].filter(Boolean).join(" · ")}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {it.remind && <span title={t("agenda.reminderToday")} style={{ color: "var(--score-mid)", display: "flex" }}><Bell width={13} height={13} /></span>}
                      {it.kind !== "followup" && it.urgency !== "overdue" && (
                        <a href={googleCalendarLink(it, `${kindLabel(it)}: ${label(it)}`)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                          title={t("agenda.addGoogle")} style={{ color: "var(--fg-3)", display: "flex" }}>
                          <OpenNewWindow width={12} height={12} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: "var(--fg-3)", lineHeight: 1.5, marginTop: 8 }}>{t("agenda.icsHint")}</div>
        </div>

        {/* ── Own dates ── */}
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>{t("agenda.ownTitle")}</div>
          <div style={{ fontSize: 12, color: "var(--fg-3)", lineHeight: 1.5, marginBottom: 12 }}>{t("agenda.ownSub")}</div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 8 }}>
              <div><div style={lbl}>{t("agenda.kind")}</div>
                <select style={inp} value={draft.kind} onChange={e => setDraft(d => ({ ...d, kind: e.target.value as PersonalKind }))}>
                  {PERSONAL_KINDS.map(k => <option key={k} value={k}>{t(`agenda.personalKinds.${k}`)}</option>)}
                </select>
              </div>
              <div><div style={lbl}>{t("agenda.what")}</div>
                <input style={inp} value={draft.title} placeholder={t(`agenda.placeholders.${draft.kind}`)} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 1.4fr", gap: 8 }}>
              <div><div style={lbl}>{t("agenda.date")}</div><input type="date" style={inp} value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} /></div>
              <div><div style={lbl}>{t("agenda.time")}</div><input type="time" style={inp} value={draft.time ?? ""} onChange={e => setDraft(d => ({ ...d, time: e.target.value }))} /></div>
              <div><div style={lbl}>{t("agenda.place")}</div><input style={inp} value={draft.place ?? ""} onChange={e => setDraft(d => ({ ...d, place: e.target.value }))} /></div>
            </div>
            <button className="btn btn-primary" style={{ fontSize: 12, gap: 5, justifySelf: "start" }} disabled={!draft.date} onClick={() => void addDate()}>
              <Plus width={12} height={12} /> {t("agenda.add")}
            </button>
          </div>
          {personal.length > 0 && (
            <div style={{ display: "grid", gap: 4, marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              {personal.map(p => (
                <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: p.date < today ? "var(--fg-4)" : "var(--fg-1)" }}>
                  <span style={{ width: 86, flexShrink: 0, color: "var(--fg-3)" }}>{fmtDay(p.date, lang, { day: "numeric", month: "short", year: "numeric" })}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.title || t(`agenda.personalKinds.${p.kind}`)}{p.time ? ` · ${p.time}` : ""}{p.place ? ` · ${p.place}` : ""}
                  </span>
                  <button className="btn btn-ghost btn-icon" style={{ padding: 3 }} title={t("agenda.remove")} aria-label={t("agenda.remove")}
                    onClick={() => void saveDates(personal.filter(x => x.id !== p.id))}>
                    <Trash width={12} height={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: "var(--fg-3)", lineHeight: 1.5, marginTop: 14 }}>{t("agenda.whereDeadlines")}</div>
        </div>
      </div>
    </>
  );
}

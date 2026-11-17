// After a Schnupperlehre: short debrief (aiResultsCache["schnupper-debrief"]) and the bridge to
// a Lehrstelle application at the same company (POST /api/applications/:id/lehrstelle-from-schnupper).
// What was hard and a weak rating are kept for the pupil only — debriefNotes() in
// backend/src/letter-kinds.ts never puts them into a letter.
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, ArrowRight, UserPlus, RefreshCircle } from "iconoir-react";
import type { Application } from "@application-pal/shared";
import { api } from "../lib/api";
import { useUiStore } from "../lib/store";

type Debrief = {
  dates?: string; did?: string; liked?: string; hard?: string;
  feedback?: "good" | "ok" | "bad" | ""; feedbackNotes?: string;
  fit?: "yes" | "maybe" | "no" | "";
  bridgedTo?: string; savedToProfile?: boolean;
};

/** Stages in which the debrief shows for a Schnupperlehre (taster days and after). */
export const DEBRIEF_STAGES = new Set(["interview_1", "interview_2", "accepted", "rejected"]);

function readDebrief(app: Application): Debrief {
  try {
    const d = (JSON.parse(app.aiResultsCache ?? "{}") as Record<string, Debrief>)["schnupper-debrief"];
    return d && typeof d === "object" ? d : {};
  } catch { return {}; }
}

export function SchnupperDebriefPanel({ app }: { app: Application }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const setSelected = useUiStore(s => s.setSelectedApplicationId);
  const [d, setD] = useState<Debrief>(() => readDebrief(app));
  const ref = useRef(d);
  ref.current = d;
  const [busy, setBusy] = useState<"" | "profile" | "bridge">("");
  const [msg, setMsg] = useState("");

  // Server-side markers (bridgedTo / savedToProfile) arrive with the refetched application
  const server = readDebrief(app);
  useEffect(() => {
    setD(prev => ({ ...prev, bridgedTo: server.bridgedTo, savedToProfile: server.savedToProfile }));
  }, [server.bridgedTo, server.savedToProfile]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["application", app.id] });
    queryClient.invalidateQueries({ queryKey: ["applications"] });
  };
  const save = async (next = ref.current) => {
    const { bridgedTo: _b, savedToProfile: _s, ...body } = next;
    await api.patch(`/api/applications/${app.id}/schnupper-debrief`, body).catch(() => {});
    refresh();
  };
  const change = (patch: Partial<Debrief>, persist = false) => {
    const next = { ...ref.current, ...patch };
    setD(next);
    if (persist) void save(next);
  };

  const toProfile = async () => {
    setBusy("profile"); setMsg("");
    try {
      await save();
      await api.post(`/api/applications/${app.id}/schnupper-debrief/to-profile`);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      refresh();
      setMsg(t("schnupperDebrief.savedToProfile"));
    } finally { setBusy(""); }
  };
  const openApp = (id: string) => { setSelected(id); navigate("/"); };
  const bridge = async () => {
    setBusy("bridge"); setMsg("");
    try {
      await save();
      const { data } = await api.post<{ id: string }>(`/api/applications/${app.id}/lehrstelle-from-schnupper`);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      refresh();
      openApp(data.id);
    } catch {
      setMsg(t("schnupperDebrief.bridgeFailed"));
    } finally { setBusy(""); }
  };

  const label: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--fg-2)", marginBottom: 4 };
  const input: React.CSSProperties = {
    width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-2)",
    color: "var(--fg-1)", fontSize: 12, fontFamily: "var(--font-sans)", outline: "none", resize: "vertical", boxSizing: "border-box",
  };
  const chip = (active: boolean): React.CSSProperties => ({
    fontSize: 11, padding: "3px 9px", borderRadius: 999, cursor: "pointer",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "var(--accent-08)" : "transparent", color: active ? "var(--accent)" : "var(--fg-2)",
  });
  const text = (k: "dates" | "did" | "liked" | "hard" | "feedbackNotes", rows = 2) => (
    <div>
      <div style={label}>{t(`schnupperDebrief.${k}`)}</div>
      {rows === 1
        ? <input value={d[k] ?? ""} placeholder={t(`schnupperDebrief.${k}Placeholder`)} style={input} onChange={e => change({ [k]: e.target.value })} onBlur={() => save()} />
        : <textarea value={d[k] ?? ""} rows={rows} placeholder={t(`schnupperDebrief.${k}Placeholder`)} style={input} onChange={e => change({ [k]: e.target.value })} onBlur={() => save()} />}
    </div>
  );
  const hasContent = !!(d.did?.trim() || d.liked?.trim());

  return (
    <div data-tour="drawer.schnupperDebrief" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, margin: "14px 0", background: "var(--surface-1, transparent)" }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-4)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 4 }}>{t("schnupperDebrief.title")}</div>
      <div style={{ fontSize: 12, color: "var(--fg-3)", lineHeight: 1.5, marginBottom: 12 }}>{t("schnupperDebrief.intro")}</div>

      <div style={{ display: "grid", gap: 12 }}>
        {text("dates", 1)}
        {text("did")}
        {text("liked")}
        <div>
          {text("hard")}
          <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 4 }}>{t("schnupperDebrief.hardHint")}</div>
        </div>
        <div>
          <div style={label}>{t("schnupperDebrief.feedback")}</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            {(["good", "ok", "bad"] as const).map(v => (
              <button key={v} type="button" style={chip(d.feedback === v)} onClick={() => change({ feedback: d.feedback === v ? "" : v }, true)}>{t(`schnupperDebrief.feedbackOptions.${v}`)}</button>
            ))}
          </div>
          {text("feedbackNotes")}
        </div>
        <div>
          <div style={label}>{t("schnupperDebrief.fit", { company: app.company })}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["yes", "maybe", "no"] as const).map(v => (
              <button key={v} type="button" style={chip(d.fit === v)} onClick={() => change({ fit: d.fit === v ? "" : v }, true)}>{t(`schnupperDebrief.fitOptions.${v}`)}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}>
        <button className="btn btn-secondary" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}
          disabled={!hasContent || busy !== ""} onClick={toProfile} title={hasContent ? "" : t("schnupperDebrief.needContent")}>
          {busy === "profile" ? <RefreshCircle width={12} height={12} style={{ animation: "spin 1s linear infinite" }} /> : d.savedToProfile ? <Check width={12} height={12} /> : <UserPlus width={12} height={12} />}
          {d.savedToProfile ? t("schnupperDebrief.updateProfile") : t("schnupperDebrief.toProfile")}
        </button>
        {d.bridgedTo ? (
          <button className="btn btn-primary" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }} onClick={() => openApp(d.bridgedTo!)}>
            {t("schnupperDebrief.openLehrstelle")} <ArrowRight width={12} height={12} />
          </button>
        ) : d.fit !== "no" && (
          <button className="btn btn-primary" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }} disabled={busy !== ""} onClick={bridge}>
            {busy === "bridge" ? <RefreshCircle width={12} height={12} style={{ animation: "spin 1s linear infinite" }} /> : <ArrowRight width={12} height={12} />}
            {t("schnupperDebrief.createLehrstelle", { company: app.company })}
          </button>
        )}
        {msg && <span style={{ fontSize: 11, color: "var(--fg-3)" }}>{msg}</span>}
      </div>
      {!d.bridgedTo && d.fit !== "no" && (
        <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 6, lineHeight: 1.5 }}>{t("schnupperDebrief.bridgeHint")}</div>
      )}
    </div>
  );
}

/** Banner on a Lehrstelle created from a Schnupperlehre, linking back to it. */
export function SchnupperSourceNote({ app }: { app: Application }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSelected = useUiStore(s => s.setSelectedApplicationId);
  let srcId = "";
  try { srcId = (JSON.parse(app.aiResultsCache ?? "{}") as Record<string, { id?: string }>)["schnupper-source"]?.id ?? ""; } catch { /* ignore */ }
  if (!srcId) return null;
  return (
    <div style={{ fontSize: 12, color: "var(--fg-2)", lineHeight: 1.5, padding: "8px 10px", borderRadius: 8, background: "var(--accent-08)", border: "1px solid var(--accent-15)", margin: "10px 0" }}>
      {t("schnupperDebrief.fromTaster")}{" "}
      <button type="button" style={{ font: "inherit", fontWeight: 600, color: "var(--accent)", background: "none", border: "none", padding: 0, cursor: "pointer" }}
        onClick={() => { setSelected(srcId); navigate("/"); }}>
        {t("schnupperDebrief.openTaster")}
      </button>
    </div>
  );
}

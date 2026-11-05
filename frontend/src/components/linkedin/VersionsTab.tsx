// Versions tab: every import and draft (per language or all), scored on read, with the score
// history of the imports and a side-by-side comparison of two versions. Imports can be deleted
// here (e.g. a duplicate); drafts are deleted in the AI tools tab.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, RefreshCircle, Trash, GitCompare, Xmark } from "iconoir-react";
import type { LinkedInProfile } from "@application-pal/shared";
import { api } from "../../lib/api";
import { EmptyState } from "../check/CheckLayout";
import type { LiCheckState, LiResult } from "../../pages/LinkedInCheckTabs";
import "./linkedin.css";

const AREAS = ["firstImpression", "content", "evidence", "activity"] as const;
type Area = typeof AREAS[number];
type Stats = Record<string, number | null>;
type VersionRow = {
  id: string; origin: string; source: string; lang: string | null; note: string | null; createdAt: string; parentId: string | null;
  judged: boolean; total: number | null; areas: Record<Area, { score: number; max: number }> | null; stats: Stats | null;
};
type VersionFull = { id: string; origin: string; source: string; lang: string | null; createdAt: string; profile: LinkedInProfile; result: LiResult; judged: boolean };
const STAT_ROWS = ["positionsWithText", "skills", "certifications", "languages", "recommendations", "posts", "comments", "connections"] as const;

const delta = (a: number | null | undefined, b: number | null | undefined) => {
  if (a == null || b == null) return null;
  const d = Math.round((b - a) * 10) / 10;
  return d === 0 ? null : <span className="li-delta" data-up={d > 0}>{d > 0 ? `+${d}` : d}</span>;
};

function Compare({ ids, onClose }: { ids: [string, string]; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [pair, setPair] = useState<[VersionFull, VersionFull] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setPair(null); setErr(null);
    Promise.all(ids.map(id => api.get<VersionFull>(`/api/linkedin/versions/${id}`, { params: { uiLang: i18n.language } }).then(r => r.data)))
      // Older version left, newer right.
      .then(([x, y]) => setPair(x.createdAt <= y.createdAt ? [x, y] : [y, x]))
      .catch(() => setErr(t("linkedinCheck.loadError")));
  }, [ids, i18n.language, t]);
  if (err) return <div className="chk-note" data-tone="error">{err}</div>;
  if (!pair) return <RefreshCircle width={13} height={13} className="chk-spin" />;
  const [a, b] = pair;
  const name = (v: VersionFull) => `${v.origin === "draft" ? t("linkedinCheck.source.draft") : t(`linkedinCheck.source.kind.${v.source}`, v.source)} · ${(v.lang ?? "?").toUpperCase()} · ${new Date(v.createdAt).toLocaleDateString(i18n.language)}`;
  const sa = (v: VersionFull) => ({
    positionsWithText: v.profile.positions.filter(p => p.description?.trim()).length, skills: v.profile.skills.length,
    certifications: v.profile.certifications.length, languages: v.profile.languages.length, recommendations: v.profile.recommendations.received.length,
    posts: v.profile.activity.posts.length, comments: v.profile.activity.comments.length, connections: v.profile.network.connections ?? null,
  } as Record<typeof STAT_ROWS[number], number | null>);
  const [xa, xb] = [sa(a), sa(b)];
  const text = (label: string, x: string | null | undefined, y: string | null | undefined) => (
    <div className="li-cmp-text">
      <div className="lid-label">{label}{(x ?? "") === (y ?? "") && <span className="chk-muted"> · {t("linkedinCheck.versions.same")}</span>}</div>
      {(x ?? "") !== (y ?? "") && (
        <div className="li-cmp-cols">
          <div><span className="li-cmp-tag">A</span>{x?.trim() || "—"}</div>
          <div><span className="li-cmp-tag">B</span>{y?.trim() || "—"}</div>
        </div>
      )}
    </div>
  );
  return (
    <div className="chk-card chk-stack" style={{ gap: 10 }}>
      <div className="chk-h" style={{ margin: 0, justifyContent: "space-between" }}>
        <span>{t("linkedinCheck.versions.compare")}</span>
        <button type="button" className="btn btn-ghost btn-icon chk-icon-btn" title={t("linkedinCheck.versions.closeCompare")} onClick={onClose}><Xmark width={12} height={12} /></button>
      </div>
      <div className="li-cmp-names"><div><span className="li-cmp-tag">A</span>{name(a)}</div><div><span className="li-cmp-tag">B</span>{name(b)}</div></div>
      <table className="li-cmp-table">
        <tbody>
          <tr className="li-cmp-total"><th>{t("linkedinCheck.versions.total")}</th><td>{a.result.total}</td><td>{b.result.total}</td><td>{delta(a.result.total, b.result.total)}</td></tr>
          {AREAS.map(ar => (
            <tr key={ar}><th>{t(`linkedinCheck.area.${ar}`)}</th>
              <td>{Math.round(a.result.areas[ar].score * 10) / 10} / {a.result.areas[ar].max}</td>
              <td>{Math.round(b.result.areas[ar].score * 10) / 10} / {b.result.areas[ar].max}</td>
              {/* Raw points are only comparable at the same ratable maximum; otherwise the total tells. */}
              <td>{a.result.areas[ar].max === b.result.areas[ar].max ? delta(a.result.areas[ar].score, b.result.areas[ar].score) : null}</td></tr>
          ))}
          {STAT_ROWS.map(k => (
            <tr key={k} className="li-cmp-stat"><th>{t(`linkedinCheck.versions.stat.${k}`)}</th><td>{xa[k] ?? "—"}</td><td>{xb[k] ?? "—"}</td><td>{delta(xa[k], xb[k])}</td></tr>
          ))}
        </tbody>
      </table>
      {(!a.judged || !b.judged) && <div className="chk-muted">{t("linkedinCheck.versions.unjudged")}</div>}
      {text(t("linkedinCheck.group.headline"), a.profile.basics.headline, b.profile.basics.headline)}
      {text(t("linkedinCheck.group.about"), a.profile.basics.summary, b.profile.basics.summary)}
    </div>
  );
}

export function VersionsTab({ s }: { s: LiCheckState }) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<VersionRow[] | null>(null);
  const [allLangs, setAllLangs] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const reload = () => api.get<VersionRow[]>("/api/linkedin/versions", { params: { uiLang: i18n.language } }).then(r => setRows(r.data)).catch(() => setRows([]));
  const ver = s.data?.version;
  useEffect(() => { reload(); }, [ver?.id, ver?.lang, s.draft?.id, s.draft?.raw.updatedAt, i18n.language]); // eslint-disable-line react-hooks/exhaustive-deps
  const fmt = (iso: string) => new Date(iso).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" });

  if (!rows) return <RefreshCircle width={13} height={13} className="chk-spin" />;
  const langOf = (r: VersionRow) => r.lang ?? "unknown";
  const shown = allLangs ? rows : rows.filter(r => langOf(r) === s.lang);
  // Score history of the imports of the shown language, oldest first.
  const history = rows.filter(r => r.origin === "import" && langOf(r) === s.lang && r.total != null).reverse();
  const prevImport = (r: VersionRow) => rows.filter(x => x.origin === "import" && langOf(x) === langOf(r) && x.createdAt < r.createdAt)[0];
  const togglePick = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id].slice(-2)));
  const del = async (id: string) => {
    setBusy(id);
    try { await api.delete(`/api/linkedin/versions/${id}`); setPicked(p => p.filter(x => x !== id)); await reload(); await s.load(); }
    finally { setBusy(null); setConfirmDel(null); }
  };

  return (
    <div className="chk-stack">
      {history.length > 1 && (
        <div className="chk-card chk-stack" style={{ gap: 8 }}>
          <div className="chk-h" style={{ margin: 0 }}>{t("linkedinCheck.versions.history", { lang: t(`linkedinCheck.lang.${s.lang ?? "unknown"}`) })}</div>
          <div className="li-hist" role="img" aria-label={history.map(h => `${new Date(h.createdAt).toLocaleDateString(i18n.language)}: ${h.total}`).join(", ")}>
            {history.map(h => (
              <div key={h.id} className="li-hist-col" title={`${fmt(h.createdAt)} · ${h.total}`}>
                <span className="li-hist-val">{h.total}</span>
                <span className="li-hist-bar" style={{ height: `${Math.max(4, h.total ?? 0)}%` }} />
                <span className="li-hist-date">{new Date(h.createdAt).toLocaleDateString(i18n.language, { day: "numeric", month: "numeric" })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {picked.length === 2 && <Compare ids={[picked[0], picked[1]]} onClose={() => setPicked([])} />}

      <div className="chk-card chk-stack" style={{ gap: 8 }}>
        <div className="chk-h" style={{ margin: 0, justifyContent: "space-between" }}>
          <span>{t("linkedinCheck.source.versions")}</span>
          <label className="li-inline"><input type="checkbox" checked={allLangs} onChange={e => setAllLangs(e.target.checked)} /><span>{t("linkedinCheck.versions.allLangs")}</span></label>
        </div>
        <div className="chk-muted">{picked.length < 2 ? t("linkedinCheck.versions.pickHint") : t("linkedinCheck.versions.pickedHint")}</div>
        {!shown.length ? <EmptyState icon={<Clock width={18} height={18} />} text={t("linkedinCheck.source.noVersions")} /> : (
          <ol className="li-vlist">
            {shown.map(r => {
              const current = r.id === ver?.id || r.id === s.draft?.id;
              const prev = r.origin === "import" ? prevImport(r) : rows.find(x => x.id === r.parentId);
              return (
                <li key={r.id} data-current={current} data-picked={picked.includes(r.id)}>
                  <label className="li-vpick" title={t("linkedinCheck.versions.pick")}>
                    <input type="checkbox" checked={picked.includes(r.id)} onChange={() => togglePick(r.id)} />
                  </label>
                  <div className="li-vbody">
                    <div className="li-vline">
                      <b>{r.origin === "draft" ? t("linkedinCheck.source.draft") : t(`linkedinCheck.source.kind.${r.source}`, r.source)}</b>
                      <span className="li-lang-tag">{r.lang ? r.lang.toUpperCase() : "?"}</span>
                      {current && <span className="li-kind">{t("linkedinCheck.versions.current")}</span>}
                      {r.judged && <span className="li-kind">{t("linkedinCheck.source.judged")}</span>}
                    </div>
                    <div className="chk-muted">{fmt(r.createdAt)}{r.origin === "import" && r.note && ` · ${r.note}`}</div>
                  </div>
                  <div className="li-vscore">
                    <b>{r.total ?? "—"}</b>{delta(prev?.total, r.total)}
                  </div>
                  {r.origin === "import" && (confirmDel === r.id ? (
                    <span className="li-vdel">
                      <button type="button" className="btn btn-danger li-btn" disabled={busy === r.id} onClick={() => del(r.id)}>{t("linkedinCheck.versions.deleteConfirm")}</button>
                      <button type="button" className="btn btn-ghost li-btn" onClick={() => setConfirmDel(null)}>{t("linkedinCheck.versions.cancel")}</button>
                    </span>
                  ) : (
                    <button type="button" className="btn btn-ghost btn-icon chk-icon-btn" title={t("linkedinCheck.versions.delete")} onClick={() => setConfirmDel(r.id)}>
                      <Trash width={11} height={11} />
                    </button>
                  ))}
                </li>
              );
            })}
          </ol>
        )}
        {picked.length === 1 && <div className="chk-muted"><GitCompare width={11} height={11} style={{ verticalAlign: -1 }} /> {t("linkedinCheck.versions.pickOne")}</div>}
        <div className="chk-muted">{t("linkedinCheck.versions.deleteHint")}</div>
      </div>
    </div>
  );
}

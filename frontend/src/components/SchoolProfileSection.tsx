// Guided pupil profile for the persona "schulabgaenger" (Profile page). Stored as JSON in
// user_profile.school_profile; the shape mirrors SchoolProfile in backend/src/letter-kinds.ts.
// Motivation (wish jobs), experiences, strength → example and school tests (Stellwerk & co.)
// are written once here and reused by every letter.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Plus, Trash, Sparks, RefreshCircle, WarningTriangle, StatsReport } from "iconoir-react";
import { api } from "../lib/api";
import { useUiStore } from "../lib/store";

export type TestScale = "stellwerk" | "stanine" | "percent";
export type SchoolTest = { name: string; date?: string; scale: TestScale; results: { area: string; score: number }[] };
export type ExperienceKind = "schule" | "hobby" | "verein" | "job" | "schnupper" | "anderes";
export type SchoolProfile = {
  school?: string;
  favoriteSubjects?: string;
  wishJobs?: { title: string; why?: string; since?: string }[];
  experiences?: { kind: ExperienceKind; title: string; what?: string; liked?: string; company?: string }[];
  strengths?: { strength: string; example?: string }[];
  tests?: SchoolTest[];
  /** Registered with the RAV (SEMO, bridge year): shows the RAV export again (lib/persona.tsx). */
  ravRegistered?: boolean;
  /** Longest acceptable public-transport commute in minutes (region check, RegionBadge.tsx). */
  maxCommuteMin?: number;
};

export const EXPERIENCE_KINDS: ExperienceKind[] = ["schule", "hobby", "verein", "job", "schnupper", "anderes"];

export function parseSchoolProfile(raw: string | null | undefined): SchoolProfile {
  if (!raw) return {};
  try { const j = JSON.parse(raw); return j && typeof j === "object" ? j as SchoolProfile : {}; } catch { return {}; }
}

/** Mirror of testLevel() in backend/src/letter-kinds.ts — keep in sync. */
export function testLevel(scale: TestScale, score: number): "high" | "above" | "average" | "low" {
  if (scale === "stellwerk") return score >= 600 ? "high" : score >= 550 ? "above" : score >= 450 ? "average" : "low";
  if (scale === "stanine") return score >= 8 ? "high" : score >= 7 ? "above" : score >= 4 ? "average" : "low";
  return score >= 80 ? "high" : score >= 65 ? "above" : score >= 45 ? "average" : "low";
}

/** The parsed pupil profile from the shared ["profile"] query (for the letter workspace). */
export function useSchoolProfile(): SchoolProfile {
  const { data } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await api.get<{ schoolProfile?: string | null }>("/api/profile")).data,
  });
  return parseSchoolProfile((data as { schoolProfile?: string | null } | undefined)?.schoolProfile);
}

const inp: React.CSSProperties = {
  width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-2)",
  color: "var(--fg-1)", fontSize: 12.5, fontFamily: "var(--font-sans)", outline: "none", lineHeight: 1.5,
};
const card: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 8, padding: 10, display: "grid", gap: 6, position: "relative" };
const hint: React.CSSProperties = { fontSize: 12, color: "var(--fg-3)", lineHeight: 1.5, marginBottom: 8 };

function RemoveBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button className="btn btn-ghost btn-icon" onClick={onClick} title={label} aria-label={label}
      style={{ position: "absolute", top: 6, right: 6, padding: 3 }}>
      <Trash width={12} height={12} />
    </button>
  );
}

function Block({ title, sub, children, onAdd, addLabel }: { title: string; sub: string; children: React.ReactNode; onAdd?: () => void; addLabel?: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>{title}</div>
      <div style={hint}>{sub}</div>
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
      {onAdd && (
        <button className="btn btn-ghost" style={{ fontSize: 12, marginTop: 6, gap: 4 }} onClick={onAdd}>
          <Plus width={12} height={12} /> {addLabel}
        </button>
      )}
    </div>
  );
}

export function SchoolProfileSection({ value, onSave }: { value: SchoolProfile; onSave: (next: SchoolProfile) => void }) {
  const { t } = useTranslation();
  const { ai } = useUiStore();
  const [p, setP] = useState<SchoolProfile>(value);
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState<string | null>(null);

  // Local edits; persist on blur / on structural changes (add, remove, select)
  const edit = (patch: Partial<SchoolProfile>) => setP(prev => ({ ...prev, ...patch }));
  const commit = (next?: SchoolProfile) => onSave(next ?? p);
  const change = (patch: Partial<SchoolProfile>) => { const next = { ...p, ...patch }; setP(next); onSave(next); };

  const setRow = <K extends "wishJobs" | "experiences" | "strengths">(key: K, i: number, patch: Partial<NonNullable<SchoolProfile[K]>[number]>) =>
    edit({ [key]: (p[key] ?? []).map((r, j) => j === i ? { ...r, ...patch } : r) } as Partial<SchoolProfile>);
  const removeRow = <K extends "wishJobs" | "experiences" | "strengths" | "tests">(key: K, i: number) =>
    change({ [key]: (p[key] ?? []).filter((_, j) => j !== i) } as Partial<SchoolProfile>);

  const extractTests = async () => {
    if (ai.provider === "none") { setExtractMsg(t("school.tests.noAi")); return; }
    setExtracting(true); setExtractMsg(null);
    try {
      const r = await api.post<{ tests: SchoolTest[]; errors: { name: string; error: string }[]; docs: number }>("/api/school-profile/extract-tests", { ai: { ...ai } });
      if (r.data.docs === 0) { setExtractMsg(t("school.tests.noDocs")); return; }
      if (r.data.tests.length) {
        // Replace tests with the same name + date, keep the others
        const keyOf = (x: SchoolTest) => `${x.name}|${x.date ?? ""}`.toLowerCase();
        const incoming = new Set(r.data.tests.map(keyOf));
        change({ tests: [...(p.tests ?? []).filter(x => !incoming.has(keyOf(x))), ...r.data.tests] });
      }
      setExtractMsg([
        t("school.tests.extracted", { count: r.data.tests.length }),
        ...r.data.errors.map(e => `${e.name}: ${e.error}`),
      ].join(" · "));
    } catch {
      setExtractMsg(t("school.tests.extractFailed"));
    } finally { setExtracting(false); }
  };

  const ta = (rows = 2): React.CSSProperties => ({ ...inp, resize: "vertical", minHeight: rows * 20 });

  return (
    <div data-tour="profile.school" style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div className="eyebrow" style={{ flex: 1, color: "var(--accent)" }}>{t("school.title")}</div>
      </div>
      <div style={{ ...hint, marginBottom: 18 }}>{t("school.intro")}</div>

      {/* School + favourite subjects */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 22 }}>
        <div className="field">
          <label>{t("school.school")}</label>
          <input style={inp} value={p.school ?? ""} placeholder={t("school.schoolPlaceholder")}
            onChange={e => edit({ school: e.target.value })} onBlur={() => commit()} />
        </div>
        <div className="field">
          <label>{t("school.subjects")}</label>
          <input style={inp} value={p.favoriteSubjects ?? ""} placeholder={t("school.subjectsPlaceholder")}
            onChange={e => edit({ favoriteSubjects: e.target.value })} onBlur={() => commit()} />
        </div>
      </div>

      {/* Wish jobs = motivation */}
      <Block title={t("school.wish.title")} sub={t("school.wish.sub")} addLabel={t("school.wish.add")}
        onAdd={() => change({ wishJobs: [...(p.wishJobs ?? []), { title: "" }] })}>
        {(p.wishJobs ?? []).map((w, i) => (
          <div key={i} style={card}>
            <RemoveBtn onClick={() => removeRow("wishJobs", i)} label={t("ui.remove")} />
            <input style={{ ...inp, fontWeight: 600, width: "calc(100% - 28px)" }} value={w.title} placeholder={t("school.wish.titlePlaceholder")}
              onChange={e => setRow("wishJobs", i, { title: e.target.value })} onBlur={() => commit()} />
            <textarea style={ta()} value={w.why ?? ""} placeholder={t("school.wish.whyPlaceholder")}
              onChange={e => setRow("wishJobs", i, { why: e.target.value })} onBlur={() => commit()} />
            <input style={inp} value={w.since ?? ""} placeholder={t("school.wish.sincePlaceholder")}
              onChange={e => setRow("wishJobs", i, { since: e.target.value })} onBlur={() => commit()} />
          </div>
        ))}
      </Block>

      {/* Experiences */}
      <Block title={t("school.exp.title")} sub={t("school.exp.sub")} addLabel={t("school.exp.add")}
        onAdd={() => change({ experiences: [...(p.experiences ?? []), { kind: "schule", title: "" }] })}>
        {(p.experiences ?? []).map((e, i) => (
          <div key={i} style={card}>
            <RemoveBtn onClick={() => removeRow("experiences", i)} label={t("ui.remove")} />
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 6, width: "calc(100% - 28px)" }}>
              <select style={inp} value={e.kind} onChange={ev => { const next = (p.experiences ?? []).map((r, j) => j === i ? { ...r, kind: ev.target.value as ExperienceKind } : r); change({ experiences: next }); }}>
                {EXPERIENCE_KINDS.map(k => <option key={k} value={k}>{t(`school.exp.kinds.${k}`)}</option>)}
              </select>
              <input style={{ ...inp, fontWeight: 600 }} value={e.title} placeholder={t(`school.exp.titlePlaceholder.${e.kind}`)}
                onChange={ev => setRow("experiences", i, { title: ev.target.value })} onBlur={() => commit()} />
            </div>
            {(e.kind === "schnupper" || e.kind === "job") && (
              <input style={inp} value={e.company ?? ""} placeholder={t("school.exp.companyPlaceholder")}
                onChange={ev => setRow("experiences", i, { company: ev.target.value })} onBlur={() => commit()} />
            )}
            <textarea style={ta()} value={e.what ?? ""} placeholder={t("school.exp.whatPlaceholder")}
              onChange={ev => setRow("experiences", i, { what: ev.target.value })} onBlur={() => commit()} />
            <input style={inp} value={e.liked ?? ""} placeholder={t("school.exp.likedPlaceholder")}
              onChange={ev => setRow("experiences", i, { liked: ev.target.value })} onBlur={() => commit()} />
          </div>
        ))}
      </Block>

      {/* Strength → example */}
      <Block title={t("school.str.title")} sub={t("school.str.sub")} addLabel={t("school.str.add")}
        onAdd={() => change({ strengths: [...(p.strengths ?? []), { strength: "" }] })}>
        {(p.strengths ?? []).map((s, i) => (
          <div key={i} style={card}>
            <RemoveBtn onClick={() => removeRow("strengths", i)} label={t("ui.remove")} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 6, width: "calc(100% - 28px)" }}>
              <input style={{ ...inp, fontWeight: 600 }} value={s.strength} placeholder={t("school.str.strengthPlaceholder")}
                onChange={e => setRow("strengths", i, { strength: e.target.value })} onBlur={() => commit()} />
              <input style={inp} value={s.example ?? ""} placeholder={t("school.str.examplePlaceholder")}
                onChange={e => setRow("strengths", i, { example: e.target.value })} onBlur={() => commit()} />
            </div>
            {s.strength.trim() && !s.example?.trim() && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--score-mid)" }}>
                <WarningTriangle width={11} height={11} /> {t("school.str.needsExample")}
              </div>
            )}
          </div>
        ))}
      </Block>

      {/* School tests */}
      <Block title={t("school.tests.title")} sub={t("school.tests.sub")}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button className="btn btn-secondary" style={{ fontSize: 12, gap: 5 }} disabled={extracting} onClick={extractTests}>
            {extracting
              ? <><RefreshCircle width={12} height={12} style={{ animation: "spin 1s linear infinite" }} /> {t("school.tests.extracting")}</>
              : <><Sparks width={12} height={12} /> {t("school.tests.extract")}</>}
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 12, gap: 4 }}
            onClick={() => change({ tests: [...(p.tests ?? []), { name: "Stellwerk 8", scale: "stellwerk", results: [] }] })}>
            <Plus width={12} height={12} /> {t("school.tests.add")}
          </button>
          <Link to="/documents" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>{t("school.tests.toDocuments")}</Link>
        </div>
        {extractMsg && <div style={{ fontSize: 11.5, color: "var(--fg-3)" }}>{extractMsg}</div>}
        {(p.tests ?? []).map((test, i) => (
          <div key={i} style={card}>
            <RemoveBtn onClick={() => removeRow("tests", i)} label={t("ui.remove")} />
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.2fr", gap: 6, width: "calc(100% - 28px)" }}>
              <input style={{ ...inp, fontWeight: 600 }} value={test.name}
                onChange={e => edit({ tests: (p.tests ?? []).map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} onBlur={() => commit()} />
              <input style={inp} value={test.date ?? ""} placeholder={t("school.tests.datePlaceholder")}
                onChange={e => edit({ tests: (p.tests ?? []).map((x, j) => j === i ? { ...x, date: e.target.value } : x) })} onBlur={() => commit()} />
              <select style={inp} value={test.scale}
                onChange={e => change({ tests: (p.tests ?? []).map((x, j) => j === i ? { ...x, scale: e.target.value as TestScale } : x) })}>
                {(["stellwerk", "stanine", "percent"] as const).map(sc => <option key={sc} value={sc}>{t(`school.tests.scales.${sc}`)}</option>)}
              </select>
            </div>
            {test.results.map((r, k) => {
              const lvl = testLevel(test.scale, r.score);
              const setRes = (patch: Partial<{ area: string; score: number }>, persist = false) => {
                const tests = (p.tests ?? []).map((x, j) => j === i ? { ...x, results: x.results.map((y, m) => m === k ? { ...y, ...patch } : y) } : x);
                if (persist) change({ tests }); else edit({ tests });
              };
              return (
                <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr 80px 150px 24px", gap: 6, alignItems: "center" }}>
                  <input style={inp} value={r.area} onChange={e => setRes({ area: e.target.value })} onBlur={() => commit()} />
                  <input style={inp} type="number" value={Number.isFinite(r.score) ? r.score : ""} onChange={e => setRes({ score: Number(e.target.value) })} onBlur={() => commit()} />
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, justifySelf: "start",
                    color: lvl === "high" || lvl === "above" ? "var(--score-high)" : "var(--fg-3)",
                    background: lvl === "high" || lvl === "above" ? "var(--score-high-bg)" : "var(--surface-2)",
                  }}>{t(`school.tests.levels.${lvl}`)}</span>
                  <button className="btn btn-ghost btn-icon" style={{ padding: 3 }} title={t("ui.remove")} aria-label={t("ui.remove")}
                    onClick={() => change({ tests: (p.tests ?? []).map((x, j) => j === i ? { ...x, results: x.results.filter((_, m) => m !== k) } : x) })}>
                    <Trash width={11} height={11} />
                  </button>
                </div>
              );
            })}
            <button className="btn btn-ghost" style={{ fontSize: 11.5, gap: 4, justifySelf: "start" }}
              onClick={() => change({ tests: (p.tests ?? []).map((x, j) => j === i ? { ...x, results: [...x.results, { area: "", score: test.scale === "stellwerk" ? 500 : test.scale === "stanine" ? 5 : 50 }] } : x) })}>
              <Plus width={11} height={11} /> {t("school.tests.addResult")}
            </button>
          </div>
        ))}
        {(p.tests ?? []).length > 0 && (
          <div style={{ display: "flex", gap: 6, fontSize: 11.5, color: "var(--fg-3)", lineHeight: 1.5 }}>
            <StatsReport width={12} height={12} style={{ flexShrink: 0, marginTop: 2 }} /> {t("school.tests.rule")}
          </div>
        )}
      </Block>

      <Block title={t("school.commute.title")} sub={t("school.commute.sub")}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "var(--fg-1)" }}>
          {t("school.commute.label")}
          <select style={{ ...inp, width: "auto" }} value={p.maxCommuteMin ?? 60}
            onChange={e => change({ maxCommuteMin: Number(e.target.value) })}>
            {[30, 45, 60, 75, 90, 120].map(n => <option key={n} value={n}>{t("school.commute.minutes", { count: n })}</option>)}
          </select>
        </label>
      </Block>

      <Block title={t("school.rav.title")} sub={t("school.rav.sub")}>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "var(--fg-1)", cursor: "pointer", lineHeight: 1.5 }}>
          <input type="checkbox" checked={!!p.ravRegistered} style={{ marginTop: 3 }}
            onChange={e => change({ ravRegistered: e.target.checked || undefined })} />
          {t("school.rav.label")}
        </label>
      </Block>
    </div>
  );
}

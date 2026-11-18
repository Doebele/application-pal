// Pupil CV (persona Schulabgänger, route /school-cv): CV-only fields on the left (stored as
// school_profile.cv), live preview + checklist on the right. The model, checklist, PDF and
// Google Doc come from the backend (backend/src/school-cv.ts) — the page renders, never rebuilds.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, Trash, Download, Page, Check, WarningTriangle, Xmark, MediaImage, RefreshCircle, OpenNewWindow } from "iconoir-react";
import { Topbar } from "../components/Topbar";
import { api } from "../lib/api";

type Level = "native" | "very_good" | "good" | "basic" | "";
type CvData = {
  birthDate?: string; nationality?: string; street?: string; zipCity?: string; photo?: string;
  schools?: { from?: string; to?: string; name: string; place?: string }[];
  languages?: { name: string; level?: Level }[];
  it?: string; hobbies?: string;
  parents?: { name: string; job?: string; phone?: string }[];
  references?: { name: string; role?: string; phone?: string; email?: string }[];
};
type Profile = { name?: string; email?: string; phone?: string; location?: string; photoUrl?: string; schoolProfile?: string | null };
type Model = { lang: string; title: string; name: string; hasPhoto: boolean; personal: { label: string; value: string }[]; sections: { id: string; title: string; rows: { when?: string; what: string; detail?: string }[] }[] };
type CvCheck = { id: string; status: "ok" | "warn" | "fail"; params?: Record<string, string | number> };
type Lang = "de" | "en" | "fr";

const inp: React.CSSProperties = {
  width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-2)",
  color: "var(--fg-1)", fontSize: 12.5, fontFamily: "var(--font-sans)", outline: "none", boxSizing: "border-box",
};
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--fg-2)", marginBottom: 3 };
const hint: React.CSSProperties = { fontSize: 12, color: "var(--fg-3)", lineHeight: 1.5, marginBottom: 8 };
const card: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 8, padding: 10, display: "grid", gap: 6, position: "relative" };
const STATUS_COLOR = { ok: "var(--score-high)", warn: "var(--score-mid)", fail: "var(--score-low)" } as const;

function parseSp(raw: string | null | undefined): Record<string, unknown> {
  try { const j = JSON.parse(raw ?? "{}"); return j && typeof j === "object" ? j : {}; } catch { return {}; }
}

/** Resizes a picked image to max 600 × 800 px JPEG (keeps the stored profile small). */
async function resizePhoto(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 600 / bmp.width, 800 / bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function Block({ title, sub, children, onAdd, addLabel }: { title: string; sub?: string; children: React.ReactNode; onAdd?: () => void; addLabel?: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>{title}</div>
      {sub && <div style={hint}>{sub}</div>}
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
      {onAdd && (
        <button className="btn btn-ghost" style={{ fontSize: 12, marginTop: 6, gap: 4 }} onClick={onAdd}>
          <Plus width={12} height={12} /> {addLabel}
        </button>
      )}
    </div>
  );
}

function Remove({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button className="btn btn-ghost btn-icon" onClick={onClick} title={label} aria-label={label} style={{ position: "absolute", top: 6, right: 6, padding: 3 }}>
      <Trash width={12} height={12} />
    </button>
  );
}

export function SchoolCvPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: async () => (await api.get<Profile>("/api/profile")).data });
  const [cv, setCv] = useState<CvData>({});
  const loaded = useRef(false);
  const [lang, setLang] = useState<Lang>("de");
  const [busy, setBusy] = useState<"" | "pdf" | "doc">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);

  useEffect(() => {
    if (!profile || loaded.current) return;
    loaded.current = true;
    setCv((parseSp(profile.schoolProfile).cv as CvData | undefined) ?? {});
  }, [profile]);

  const { data: preview } = useQuery({
    queryKey: ["school-cv", lang],
    queryFn: async () => (await api.get<{ model: Model; checks: CvCheck[] }>(`/api/school-cv?lang=${lang}`)).data,
  });

  // Persist: merge into the latest stored pupil profile (the Profile page owns the other parts)
  const persist = async (next: CvData) => {
    const latest = (qc.getQueryData(["profile"]) as Profile | undefined) ?? profile;
    const sp = { ...parseSp(latest?.schoolProfile), cv: next };
    const schoolProfile = JSON.stringify(sp);
    qc.setQueryData(["profile"], { ...(latest ?? {}), schoolProfile });
    await api.patch("/api/profile", { schoolProfile }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["school-cv"] });
  };
  const edit = (patch: Partial<CvData>) => setCv(prev => ({ ...prev, ...patch }));
  const commit = () => void persist(cv);
  const change = (patch: Partial<CvData>) => { const next = { ...cv, ...patch }; setCv(next); void persist(next); };

  type ListKey = "schools" | "languages" | "parents" | "references";
  const setRow = <K extends ListKey>(key: K, i: number, patch: Partial<NonNullable<CvData[K]>[number]>) =>
    edit({ [key]: (cv[key] ?? []).map((r, j) => (j === i ? { ...r, ...patch } : r)) } as Partial<CvData>);
  const removeRow = (key: ListKey, i: number) => change({ [key]: (cv[key] ?? []).filter((_, j) => j !== i) } as Partial<CvData>);
  const addRow = (key: ListKey, row: object) => edit({ [key]: [...(cv[key] ?? []), row] } as Partial<CvData>);

  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    try { change({ photo: await resizePhoto(f) }); } catch { setMsg({ ok: false, text: t("schoolCv.photoFailed") }); }
  };

  const downloadPdf = async () => {
    setBusy("pdf"); setMsg(null);
    try {
      const r = await api.get(`/api/school-cv/pdf?lang=${lang}`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${preview?.model.title ?? "CV"}_${(profile?.name ?? "").replace(/\s+/g, "_") || "CV"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { setMsg({ ok: false, text: t("schoolCv.pdfFailed") }); }
    finally { setBusy(""); }
  };
  const exportDoc = async () => {
    setBusy("doc"); setMsg(null);
    try {
      const r = await api.post<{ docUrl: string }>("/api/school-cv/export-doc", { lang });
      setMsg({ ok: true, text: t("schoolCv.docDone"), url: r.data.docUrl });
    } catch (e) {
      setMsg({ ok: false, text: (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t("schoolCv.docFailed") });
    } finally { setBusy(""); }
  };

  const photoSrc = cv.photo || (profile?.photoUrl?.startsWith("http") ? profile.photoUrl : "");
  const checks = preview?.checks ?? [];
  const open = checks.filter(c => c.status !== "ok").length;

  return (
    <>
      <Topbar title={t("schoolCv.title")} sub={t("schoolCv.sub")} />
      <div className="split-scroll" style={{ gridTemplateColumns: "minmax(320px, 1fr) minmax(360px, 1.1fr)" }}>
        {/* ── Form ── */}
        <div>
          <div style={{ ...hint, padding: "8px 10px", borderRadius: 8, background: "var(--accent-08)", border: "1px solid var(--accent-15)", color: "var(--fg-2)", marginBottom: 20 }}>
            {t("schoolCv.fromProfile")} <Link to="/profile" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>{t("schoolCv.toProfile")}</Link>
          </div>

          <Block title={t("schoolCv.photo")} sub={t("schoolCv.photoSub")}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 70, height: 90, borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-2)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {photoSrc ? <img src={photoSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <MediaImage width={20} height={20} style={{ color: "var(--fg-4)" }} />}
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label className="btn btn-secondary" style={{ fontSize: 12, gap: 5, cursor: "pointer" }}>
                  <MediaImage width={12} height={12} /> {t("schoolCv.photoPick")}
                  <input type="file" accept="image/jpeg,image/png" style={{ display: "none" }} onChange={e => void pickPhoto(e.target.files?.[0])} />
                </label>
                {cv.photo && <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => change({ photo: undefined })}>{t("schoolCv.photoRemove")}</button>}
              </div>
            </div>
          </Block>

          <Block title={t("schoolCv.personal")} sub={t("schoolCv.personalSub")}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><div style={lbl}>{t("schoolCv.street")}</div><input style={inp} value={cv.street ?? ""} onChange={e => edit({ street: e.target.value })} onBlur={commit} /></div>
              <div><div style={lbl}>{t("schoolCv.zipCity")}</div><input style={inp} value={cv.zipCity ?? ""} placeholder={profile?.location ?? ""} onChange={e => edit({ zipCity: e.target.value })} onBlur={commit} /></div>
              <div><div style={lbl}>{t("schoolCv.birthDate")}</div><input type="date" style={inp} value={cv.birthDate ?? ""} onChange={e => change({ birthDate: e.target.value })} /></div>
              <div><div style={lbl}>{t("schoolCv.nationality")}</div><input style={inp} value={cv.nationality ?? ""} placeholder={t("schoolCv.nationalityPlaceholder")} onChange={e => edit({ nationality: e.target.value })} onBlur={commit} /></div>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--fg-3)" }}>
              {[profile?.name, profile?.phone, profile?.email].filter(Boolean).join(" · ") || t("schoolCv.noContact")}{" "}
              <Link to="/profile" style={{ color: "var(--accent)", textDecoration: "none" }}>{t("schoolCv.editContact")}</Link>
            </div>
          </Block>

          <Block title={t("schoolCv.schools")} sub={t("schoolCv.schoolsSub")} onAdd={() => addRow("schools", { name: "", from: "", to: "", place: "" })} addLabel={t("schoolCv.addSchool")}>
            {(cv.schools ?? []).map((r, i) => (
              <div key={i} style={card}>
                <Remove onClick={() => removeRow("schools", i)} label={t("schoolCv.remove")} />
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr", gap: 6, paddingRight: 24 }}>
                  <input style={inp} value={r.name} placeholder={t("schoolCv.schoolName")} onChange={e => setRow("schools", i, { name: e.target.value })} onBlur={commit} />
                  <input style={inp} value={r.place ?? ""} placeholder={t("schoolCv.place")} onChange={e => setRow("schools", i, { place: e.target.value })} onBlur={commit} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <input style={inp} value={r.from ?? ""} placeholder={t("schoolCv.from")} onChange={e => setRow("schools", i, { from: e.target.value })} onBlur={commit} />
                  <input style={inp} value={r.to ?? ""} placeholder={t("schoolCv.to")} onChange={e => setRow("schools", i, { to: e.target.value })} onBlur={commit} />
                </div>
              </div>
            ))}
          </Block>

          <Block title={t("schoolCv.languages")} onAdd={() => addRow("languages", { name: "", level: "" })} addLabel={t("schoolCv.addLanguage")}>
            {(cv.languages ?? []).map((r, i) => (
              <div key={i} style={{ ...card, gridTemplateColumns: "1.4fr 1fr", paddingRight: 34 }}>
                <Remove onClick={() => removeRow("languages", i)} label={t("schoolCv.remove")} />
                <input style={inp} value={r.name} placeholder={t("schoolCv.languageName")} onChange={e => setRow("languages", i, { name: e.target.value })} onBlur={commit} />
                <select style={inp} value={r.level ?? ""} onChange={e => { const next = { ...cv, languages: (cv.languages ?? []).map((x, j) => j === i ? { ...x, level: e.target.value as Level } : x) }; setCv(next); void persist(next); }}>
                  <option value="">—</option>
                  {(["native", "very_good", "good", "basic"] as const).map(l => <option key={l} value={l}>{t(`schoolCv.levels.${l}`)}</option>)}
                </select>
              </div>
            ))}
          </Block>

          <Block title={t("schoolCv.itHobbies")}>
            <div><div style={lbl}>{t("schoolCv.it")}</div><input style={inp} value={cv.it ?? ""} placeholder={t("schoolCv.itPlaceholder")} onChange={e => edit({ it: e.target.value })} onBlur={commit} /></div>
            <div><div style={lbl}>{t("schoolCv.hobbies")}</div><input style={inp} value={cv.hobbies ?? ""} placeholder={t("schoolCv.hobbiesPlaceholder")} onChange={e => edit({ hobbies: e.target.value })} onBlur={commit} /></div>
          </Block>

          <Block title={t("schoolCv.parents")} sub={t("schoolCv.parentsSub")} onAdd={() => addRow("parents", { name: "", job: "", phone: "" })} addLabel={t("schoolCv.addParent")}>
            {(cv.parents ?? []).map((r, i) => (
              <div key={i} style={{ ...card, gridTemplateColumns: "1fr 1fr 1fr", paddingRight: 34 }}>
                <Remove onClick={() => removeRow("parents", i)} label={t("schoolCv.remove")} />
                <input style={inp} value={r.name} placeholder={t("schoolCv.parentName")} onChange={e => setRow("parents", i, { name: e.target.value })} onBlur={commit} />
                <input style={inp} value={r.job ?? ""} placeholder={t("schoolCv.parentJob")} onChange={e => setRow("parents", i, { job: e.target.value })} onBlur={commit} />
                <input style={inp} value={r.phone ?? ""} placeholder={t("schoolCv.phone")} onChange={e => setRow("parents", i, { phone: e.target.value })} onBlur={commit} />
              </div>
            ))}
          </Block>

          <Block title={t("schoolCv.references")} sub={t("schoolCv.referencesSub")} onAdd={() => addRow("references", { name: "", role: "", phone: "", email: "" })} addLabel={t("schoolCv.addReference")}>
            {(cv.references ?? []).map((r, i) => (
              <div key={i} style={{ ...card, gridTemplateColumns: "1fr 1fr", paddingRight: 34 }}>
                <Remove onClick={() => removeRow("references", i)} label={t("schoolCv.remove")} />
                <input style={inp} value={r.name} placeholder={t("schoolCv.refName")} onChange={e => setRow("references", i, { name: e.target.value })} onBlur={commit} />
                <input style={inp} value={r.role ?? ""} placeholder={t("schoolCv.refRole")} onChange={e => setRow("references", i, { role: e.target.value })} onBlur={commit} />
                <input style={inp} value={r.phone ?? ""} placeholder={t("schoolCv.phone")} onChange={e => setRow("references", i, { phone: e.target.value })} onBlur={commit} />
                <input style={inp} value={r.email ?? ""} placeholder={t("schoolCv.email")} onChange={e => setRow("references", i, { email: e.target.value })} onBlur={commit} />
              </div>
            ))}
          </Block>
        </div>

        {/* ── Preview + checklist ── */}
        <div style={{ position: "sticky", top: 12, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 2, background: "var(--surface-2)", borderRadius: 6, padding: 2 }}>
              {(["de", "en", "fr"] as const).map(l => (
                <button key={l} onClick={() => setLang(l)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, border: "none", cursor: "pointer", background: lang === l ? "var(--surface)" : "transparent", color: lang === l ? "var(--fg-1)" : "var(--fg-3)", fontWeight: 600, fontFamily: "var(--font-sans)" }}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary" style={{ fontSize: 12, gap: 5 }} disabled={busy !== ""} onClick={downloadPdf}>
              {busy === "pdf" ? <RefreshCircle width={12} height={12} style={{ animation: "spin 1s linear infinite" }} /> : <Download width={12} height={12} />} {t("schoolCv.pdf")}
            </button>
            <button className="btn btn-secondary" style={{ fontSize: 12, gap: 5 }} disabled={busy !== ""} onClick={exportDoc}>
              {busy === "doc" ? <RefreshCircle width={12} height={12} style={{ animation: "spin 1s linear infinite" }} /> : <Page width={12} height={12} />} {t("schoolCv.doc")}
            </button>
          </div>
          {msg && (
            <div style={{ fontSize: 12, color: msg.ok ? "var(--score-high)" : "var(--score-low)" }}>
              {msg.text}{msg.url && <> <a href={msg.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontWeight: 600 }}>{t("schoolCv.openDoc")} <OpenNewWindow width={10} height={10} /></a></>}
            </div>
          )}

          {/* A4-like preview */}
          <div style={{ background: "#fff", color: "#1f1f24", borderRadius: 6, boxShadow: "0 1px 6px rgba(0,0,0,0.12)", padding: "28px 30px", fontFamily: "Helvetica, Arial, sans-serif", fontSize: 11.5, lineHeight: 1.45, minHeight: 420 }}>
            {preview && (
              <>
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: "#61616b", letterSpacing: "0.06em", textTransform: "uppercase" }}>{preview.model.title}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, margin: "4px 0 10px" }}>{preview.model.name || "—"}</div>
                    {preview.model.personal.map(p => (
                      <div key={p.label} style={{ display: "grid", gridTemplateColumns: "92px 1fr", gap: 8 }}>
                        <span style={{ color: "#61616b", fontSize: 10.5 }}>{p.label}</span><span>{p.value}</span>
                      </div>
                    ))}
                  </div>
                  {photoSrc && <img src={photoSrc} alt="" style={{ width: 84, height: 108, objectFit: "contain", border: "1px solid #d0d0d4", flexShrink: 0 }} />}
                </div>
                {preview.model.sections.map(sec => (
                  <div key={sec.id} style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", borderBottom: "1px solid #d0d0d4", paddingBottom: 3, marginBottom: 6 }}>{sec.title}</div>
                    {sec.rows.map((r, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8, marginBottom: 4 }}>
                        <span style={{ color: "#61616b", fontSize: 10.5 }}>{r.when}</span>
                        <span><strong>{r.what}</strong>{r.detail && <span style={{ color: "#61616b" }}><br />{r.detail}</span>}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Checklist */}
          {checks.length > 0 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                {t("schoolCv.checklist")}{" "}
                <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500, color: open ? "var(--score-mid)" : "var(--score-high)" }}>
                  · {open ? t("schoolCv.openCount", { count: open }) : t("schoolCv.allOk")}
                </span>
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                {checks.map(c => {
                  const Icon = c.status === "ok" ? Check : c.status === "warn" ? WarningTriangle : Xmark;
                  // "missing" holds field ids (name, phone, email, address) → translate them
                  const params = { ...(c.params ?? {}) };
                  if (typeof params.missing === "string")
                    params.missing = params.missing.split(", ").filter(Boolean).map(x => t(`schoolCv.missing.${x}`)).join(", ");
                  return (
                    <div key={c.id} style={{ display: "flex", gap: 7, fontSize: 12, lineHeight: 1.5, color: c.status === "ok" ? "var(--fg-3)" : "var(--fg-1)" }}>
                      <Icon width={12} height={12} style={{ color: STATUS_COLOR[c.status], flexShrink: 0, marginTop: 3 }} />
                      <span>{t(c.id === "schools" && c.status === "warn" && !params.gap ? "schoolCv.checks.schools.noDates" : `schoolCv.checks.${c.id}.${c.status}`, params)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

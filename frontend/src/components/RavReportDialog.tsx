import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Xmark, Table2Columns, RefreshCircle, Download, OpenNewWindow, Refresh } from "iconoir-react";
import { api } from "../lib/api";
import { useUiStore } from "../lib/store";

type LinkedSheet = { id: string; title: string; url: string; lang: string; entries: number };
type Result = { ok: boolean; text: string; url?: string };

/**
 * The RAV report dialog: sync into the sheet configured in Settings, or produce a
 * one-off file. When nothing is configured yet, the target can be set up right here
 * instead of sending the user to Settings first.
 */
export function RavReportDialog({ applicationIds, count, onClose }: {
  applicationIds: string[];
  count: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [linked, setLinked]   = useState<LinkedSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState<null | "sync" | "sheet" | "csv" | "link" | "create">(null);
  const [result, setResult]   = useState<Result | null>(null);
  const [lang, setLang]       = useState(useUiStore.getState().uiLanguage);
  const [linkInput, setLinkInput] = useState("");

  useEffect(() => {
    api.get<{ ravSheetId?: string | null }>("/api/profile")
      .then(async r => {
        if (!r.data.ravSheetId) return;
        const res = await api.get<LinkedSheet>(`/api/rav/sheet-info?spreadsheetId=${r.data.ravSheetId}`).catch(() => null);
        if (res) setLinked(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const errText = (e: unknown, fallback: string) =>
    (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

  const sync = async () => {
    setBusy("sync"); setResult(null);
    try {
      const r = await api.post<{ url: string; added: number; updated: number; skipped: number }>(
        "/api/export/rav-sheet", { applicationIds, target: "linked" });
      setResult({ ok: true, text: t("rav.result", r.data), url: r.data.url });
    } catch (e) { setResult({ ok: false, text: errText(e, t("rav.exportFailed")) }); }
    finally { setBusy(null); }
  };

  const exportSheet = async () => {
    setBusy("sheet"); setResult(null);
    try {
      const r = await api.post<{ url: string; added: number; updated: number; skipped: number }>(
        "/api/export/rav-sheet", { applicationIds, target: "new", lang });
      setResult({ ok: true, text: t("rav.result", r.data), url: r.data.url });
      window.open(r.data.url, "_blank");
    } catch (e) { setResult({ ok: false, text: errText(e, t("rav.exportFailed")) }); }
    finally { setBusy(null); }
  };

  const exportCsv = async () => {
    setBusy("csv"); setResult(null);
    try {
      const r = await api.post("/api/export/rav-csv", { applicationIds, lang }, { responseType: "blob" });
      const blob = r.data as Blob;
      if (blob.type.includes("json")) throw { response: { data: JSON.parse(await blob.text()) } };
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rav-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setResult({ ok: true, text: t("rav.csvDone", { count }) });
    } catch (e) { setResult({ ok: false, text: errText(e, t("rav.exportFailed")) }); }
    finally { setBusy(null); }
  };

  const linkExisting = async () => {
    if (!linkInput.trim()) return;
    setBusy("link"); setResult(null);
    try {
      const r = await api.get<LinkedSheet>(`/api/rav/sheet-info?spreadsheetId=${encodeURIComponent(linkInput.trim())}`);
      await api.patch("/api/profile", { ravSheetId: r.data.id });
      setLinked(r.data); setLinkInput("");
    } catch (e) { setResult({ ok: false, text: errText(e, t("rav.notFound")) }); }
    finally { setBusy(null); }
  };

  const createTarget = async () => {
    setBusy("create"); setResult(null);
    try {
      const r = await api.post<LinkedSheet>("/api/rav/create-sheet", { lang });
      setLinked({ ...r.data, entries: 0 });
    } catch (e) { setResult({ ok: false, text: errText(e, t("rav.createFailed")) }); }
    finally { setBusy(null); }
  };

  const spin = <RefreshCircle width={12} height={12} style={{ animation: "spin 1s linear infinite" }} />;
  const box: React.CSSProperties = {
    border: "1px solid var(--border)", borderRadius: 10, padding: 14,
    display: "flex", flexDirection: "column", gap: 10,
  };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 14, padding: 24, width: 520, maxWidth: "92vw", display: "flex", flexDirection: "column", gap: 16 }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--fg-1)", display: "flex", alignItems: "center", gap: 8 }}>
              <Table2Columns width={16} height={16} /> {t("rav.reportTitle")}
            </div>
            <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 3 }}>{t("rav.menuTitle", { count })}</div>
          </div>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 8px" }} onClick={onClose}>
            <Xmark width={13} height={13} />
          </button>
        </div>

        {/* 1 — sync into the configured target */}
        <div style={box}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {t("rav.syncSection")}
          </div>
          {loading ? (
            <div style={{ fontSize: 12, color: "var(--fg-3)" }}>{spin}</div>
          ) : linked ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Table2Columns width={15} height={15} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)" }}>{linked.title}</div>
                  <div style={{ fontSize: 10, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
                    {linked.lang.toUpperCase()} · {t("rav.entries", { count: linked.entries })}
                  </div>
                </div>
                <a href={linked.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", display: "flex" }}>
                  <OpenNewWindow width={12} height={12} />
                </a>
              </div>
              <div style={{ fontSize: 11, color: "var(--fg-3)", lineHeight: 1.5 }}>{t("rav.syncHint")}</div>
              <button className="btn btn-primary" style={{ fontSize: 12, gap: 6, alignSelf: "flex-start" }}
                onClick={sync} disabled={busy !== null}>
                {busy === "sync" ? spin : <Refresh width={12} height={12} />} {t("rav.syncBtn")}
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: "var(--fg-3)", lineHeight: 1.5 }}>{t("rav.syncNone")}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <div className="field" style={{ flex: 1, margin: 0 }}>
                  <input value={linkInput} onChange={e => setLinkInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && linkExisting()}
                    placeholder={t("rav.placeholder")} style={{ fontSize: 12 }} />
                </div>
                <button className="btn btn-secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}
                  onClick={linkExisting} disabled={busy !== null || !linkInput.trim()}>
                  {busy === "link" ? spin : t("rav.confirm")}
                </button>
                <button className="btn btn-secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}
                  onClick={createTarget} disabled={busy !== null} title={t("rav.createTargetHint")}>
                  {busy === "create" ? spin : t("rav.create")}
                </button>
              </div>
            </>
          )}
        </div>

        {/* 2 — one-off export, independent of any configuration */}
        <div style={box}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {t("rav.onceSection")}
          </div>
          <div style={{ fontSize: 11, color: "var(--fg-3)", lineHeight: 1.5 }}>{t("rav.onceHint")}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field" style={{ margin: 0 }}>
              <label>{t("rav.newLang")}</label>
              <select value={lang} onChange={e => setLang(e.target.value as typeof lang)}
                style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--fg-1)", fontSize: 12, fontFamily: "var(--font-sans)" }}>
                <option value="de">Deutsch</option>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </div>
            <button className="btn btn-secondary" style={{ fontSize: 12, gap: 6 }} onClick={exportSheet} disabled={busy !== null}>
              {busy === "sheet" ? spin : <Table2Columns width={12} height={12} />} {t("rav.onceSheet")}
            </button>
            <button className="btn btn-secondary" style={{ fontSize: 12, gap: 6 }} onClick={exportCsv} disabled={busy !== null}>
              {busy === "csv" ? spin : <Download width={12} height={12} />} {t("rav.onceCsv")}
            </button>
          </div>
        </div>

        {result && (
          <div style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, color: result.ok ? "var(--green)" : "#f87171" }}>
            {result.text}
            {result.url && <a href={result.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", display: "flex" }}><OpenNewWindow width={12} height={12} /></a>}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// Shown after a Google-Doc export fell back to a plain doc because the app can't open
// the template (desktop: drive.file + own OAuth client → templates the web version
// created answer 404). Step 1: pick that template (Picker pre-searched by its name);
// the import copies it into the app's own "Pal-Templates" and re-links it everywhere.
// Step 2 (only when other templates are unreachable too): open the Picker in the folder
// of the picked file, so the user marks the rest in one go. Then the plain stand-in doc
// is deleted and the export runs again.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { WarningTriangle, Check } from "iconoir-react";
import { api } from "../lib/api";
import { GooglePickerButton, type PickedFile } from "../lib/googlePicker";
import { importTemplates, missingTemplates, parentOf, type DriveFolder, type MissingTemplate } from "../lib/driveLinks";

type DocTemplates = Record<string, { templates?: { id: string; name: string }[] }>;

export function MissingTemplateNotice({ templateId, appId, fallbackDocUrl, onRetry }: {
  templateId: string;
  appId: string;
  /** The plain doc the export created instead — replaced once the template is linked. */
  fallbackDocUrl?: string | null;
  /** Runs the export again; resolves when it is done. */
  onRetry: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // Step 2: other templates still unreachable + the folder the first pick came from
  const [rest, setRest] = useState<MissingTemplate[] | null>(null);
  const [folder, setFolder] = useState<DriveFolder | null>(null);
  const [linked, setLinked] = useState(0);

  useEffect(() => {
    api.get<{ docTemplates?: string | null }>("/api/profile").then(r => {
      try {
        const cfg = JSON.parse(r.data.docTemplates ?? "{}") as DocTemplates;
        for (const c of Object.values(cfg)) {
          const hit = c.templates?.find(x => x.id === templateId);
          if (hit) { setName(hit.name); return; }
        }
      } catch { /* no name — the picker just has no title */ }
    }).catch(() => {});
  }, [templateId]);

  const errText = (e: unknown) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t("templates.relinkFailed");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["profile"] });
    qc.invalidateQueries({ queryKey: ["drive-templates"] });
    qc.invalidateQueries({ queryKey: ["template-status"] });
  };

  const finish = async () => {
    setBusy(true); setErr("");
    try {
      const oldId = fallbackDocUrl?.match(/\/d\/([\w-]{10,})/)?.[1];
      if (oldId) await api.delete(`/api/applications/${appId}/drive/files/${oldId}`).catch(() => {});
      await onRetry();
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  const pickFirst = async (f: PickedFile) => {
    setErr("");
    const files = f.all ?? [f];
    const r = await importTemplates(files, { id: templateId, name });
    if (!r.ok) { setErr(t("templates.relinkFailed")); return; }
    refresh();
    setLinked(r.ok);
    const [others, parent] = await Promise.all([missingTemplates().catch(() => []), parentOf(f.id)]);
    const left = others.filter(m => m.id !== templateId);
    if (left.length && parent) { setRest(left); setFolder(parent); return; }
    await finish();
  };

  const pickRest = async (f: PickedFile) => {
    setErr("");
    const r = await importTemplates(f.all ?? [f]);
    refresh();
    setLinked(n => n + r.ok);
    await finish();
  };

  const box: React.CSSProperties = {
    display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 8,
    background: "var(--score-mid-bg)", border: "1px solid var(--score-mid-border)", fontSize: 12, lineHeight: 1.45,
  };

  if (rest && folder) {
    const names = rest.map(m => m.name).filter(Boolean);
    return (
      <div style={box}>
        <span style={{ display: "flex", gap: 6, color: "var(--fg-1)" }}>
          <Check width={14} height={14} style={{ flexShrink: 0, color: "var(--score-high)", marginTop: 1 }} />
          <span>{t("templates.folderFollowUp", { count: rest.length, linked, folder: folder.name || "Google Drive" })}</span>
        </span>
        {names.length > 0 && (
          <span style={{ fontSize: 11, color: "var(--fg-3)" }}>{names.slice(0, 8).join(" · ")}{names.length > 8 ? " …" : ""}</span>
        )}
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
          <GooglePickerButton kind="template" title={folder.name || undefined} options={{ parentId: folder.id, multi: true }}
            onPicked={pickRest} label={t("templates.pickInFolder", { folder: folder.name || "Google Drive" })} className="btn btn-primary" />
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} disabled={busy} onClick={finish}>
            {t("templates.skipAndExport")}
          </button>
        </span>
        {err && <span style={{ color: "var(--score-low)", fontSize: 11 }}>{err}</span>}
      </div>
    );
  }

  return (
    <div style={box}>
      <span style={{ display: "flex", gap: 6, color: "var(--fg-1)" }}>
        <WarningTriangle width={14} height={14} style={{ flexShrink: 0, color: "var(--score-mid)", marginTop: 1 }} />
        <span>{name ? t("templates.missingExport", { name }) : t("templates.missingExportNoName")}</span>
      </span>
      <span>
        <GooglePickerButton kind="template" title={name || undefined} options={name ? { query: name } : undefined}
          onPicked={pickFirst} label={t("templates.relinkAndExport")} className="btn btn-primary" />
      </span>
      {err && <span style={{ color: "var(--score-low)", fontSize: 11 }}>{err}</span>}
    </div>
  );
}

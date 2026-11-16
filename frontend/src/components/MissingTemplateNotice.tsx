// Shown after a Google-Doc export fell back to a plain doc because the app can't open
// the template (desktop: drive.file + own OAuth client → templates the web version
// created answer 404). Lets the user pick that template in Google Drive right here:
// the import copies it into the app's own "Pal-Templates" and re-links it everywhere
// (`replaceId`), the plain stand-in doc is deleted and the export runs again.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { WarningTriangle } from "iconoir-react";
import { api } from "../lib/api";
import { GooglePickerButton, type PickedFile } from "../lib/googlePicker";

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

  const relink = async (f: PickedFile) => {
    setErr("");
    try {
      await api.post("/api/drive/templates/import", { fileId: f.id, replaceId: templateId });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["drive-templates"] });
      const oldId = fallbackDocUrl?.match(/\/d\/([\w-]{10,})/)?.[1];
      if (oldId) await api.delete(`/api/applications/${appId}/drive/files/${oldId}`).catch(() => {});
      await onRetry();
    } catch (e) {
      setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t("templates.relinkFailed"));
    }
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 8,
      background: "var(--score-mid-bg)", border: "1px solid var(--score-mid-border)", fontSize: 12, lineHeight: 1.45,
    }}>
      <span style={{ display: "flex", gap: 6, color: "var(--fg-1)" }}>
        <WarningTriangle width={14} height={14} style={{ flexShrink: 0, color: "var(--score-mid)", marginTop: 1 }} />
        <span>{name ? t("templates.missingExport", { name }) : t("templates.missingExportNoName")}</span>
      </span>
      <span>
        <GooglePickerButton kind="template" title={name || undefined} onPicked={relink}
          label={t("templates.relinkAndExport")} className="btn btn-primary" />
      </span>
      {err && <span style={{ color: "var(--score-low)", fontSize: 11 }}>{err}</span>}
    </div>
  );
}

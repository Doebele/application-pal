// Re-linking Drive files the app can no longer open (desktop: drive.file + own OAuth
// client → everything the web version linked answers 404). Under drive.file the app
// can't list a folder, so "other files in the same folder" are found by opening the
// next Picker in the folder of a file the user already picked (`parentOf`) and matching
// what they select there by name.
import { api } from "./api";
import type { PickedFile } from "./googlePicker";

export type LinkStatus = "ok" | "missing" | "unknown";
export type DriveFolder = { id: string; name: string };
export type MissingTemplate = { id: string; name: string };

type TemplateCfg = Record<string, {
  activeId?: string | null; activeIdDe?: string | null; activeIdEn?: string | null;
  templates?: { id: string; name: string }[];
}>;

/** Lower-case, no extension, punctuation → space ("cme-Anschreiben Vorlage-de.docx" → "cme anschreiben vorlage de"). */
export const normName = (s: string) => s.toLowerCase()
  .replace(/\.(docx?|pdf|gdoc|odt|rtf|txt)$/i, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export async function driveStatus(ids: string[]): Promise<{ connected: boolean; status: Record<string, LinkStatus> }> {
  if (!ids.length) return { connected: true, status: {} };
  const r = await api.post<{ connected: boolean; status: Record<string, LinkStatus> }>("/api/drive/files/status", { ids });
  return r.data;
}

/** Folder of a picked file — null when Drive doesn't tell (e.g. "Shared with me"). */
export async function parentOf(fileId: string): Promise<DriveFolder | null> {
  try {
    const r = await api.get<{ parent: DriveFolder | null }>(`/api/drive/files/${fileId}/parent`);
    return r.data.parent;
  } catch { return null; }
}

/** Every template the user's config refers to that the app can't open. */
export async function missingTemplates(): Promise<MissingTemplate[]> {
  const r = await api.get<{ docTemplates?: string | null }>("/api/profile");
  let cfg: TemplateCfg = {};
  try { cfg = JSON.parse(r.data.docTemplates ?? "{}") as TemplateCfg; } catch { /* empty */ }
  const names = new Map<string, string>();
  for (const c of Object.values(cfg)) {
    for (const t of c.templates ?? []) names.set(t.id, t.name);
    for (const id of [c.activeId, c.activeIdDe, c.activeIdEn]) if (id && !names.has(id)) names.set(id, "");
  }
  const { connected, status } = await driveStatus([...names.keys()]);
  if (!connected) return [];
  return [...names].filter(([id]) => status[id] === "missing").map(([id, name]) => ({ id, name }));
}

/**
 * Imports picked template files into the app's own "Pal-Templates" (the backend re-links
 * entries with the same name). `replace` = the template the user is fixing right now: it
 * gets `replaceId` when it was the only pick or the pick with its name, so it is linked
 * even when the picked file is named differently.
 */
export async function importTemplates(files: PickedFile[], replace?: MissingTemplate): Promise<{ ok: number; relinked: number; failed: number }> {
  let ok = 0, relinked = 0, failed = 0;
  const target = replace ? normName(replace.name) : "";
  for (const f of files) {
    const useReplace = !!replace && (files.length === 1 || (!!target && normName(f.name) === target));
    try {
      const r = await api.post<{ relinked?: number }>("/api/drive/templates/import", { fileId: f.id, ...(useReplace ? { replaceId: replace!.id } : {}) });
      ok++; relinked += r.data.relinked ?? 0;
    } catch { failed++; }
  }
  return { ok, relinked, failed };
}

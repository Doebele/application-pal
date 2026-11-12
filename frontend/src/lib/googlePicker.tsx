// Google Picker: lets the user pick an existing Drive file or folder.
//
// The desktop app only has the `drive.file` scope — it sees files it created itself
// plus files the user explicitly picked here (the Picker grants access to exactly
// those, tied to the Cloud project via `appId`). Pasting a link to an existing file
// therefore no longer works on the desktop; every "choose a file / folder" goes
// through this button. Needs GOOGLE_API_KEY + GOOGLE_APP_ID on the server
// (`/api/google/picker-config`); without them the button renders nothing.
//
// Desktop: the picker iframe needs the user's Google cookies, which WKWebView blocks
// ("Can't access your Google Account"). There the picker opens on a page of the
// sidecar in the default browser (POST /api/google/picker-session) and this module
// polls the session until the user picked or cancelled.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import { hasShell } from "./desktopShell";
import i18n from "../i18n";

export type PickerKind = "folder" | "document" | "spreadsheet" | "template" | "any";
export type PickedFile = { id: string; name: string; mimeType: string; url: string };

type PickerConfig = { available: boolean; apiKey?: string; appId?: string; accessToken?: string; error?: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { gapi?: any; google?: any } }

let loader: Promise<void> | null = null;
function loadPickerApi(): Promise<void> {
  if (window.google?.picker) return Promise.resolve();
  loader ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js";
    s.async = true;
    s.onload = () => window.gapi.load("picker", { callback: () => resolve(), onerror: () => reject(new Error("picker")) });
    s.onerror = () => { loader = null; reject(new Error("Google-Picker konnte nicht geladen werden")); };
    document.head.appendChild(s);
  });
  return loader;
}

const MIME = {
  folder: "application/vnd.google-apps.folder",
  document: "application/vnd.google-apps.document",
  spreadsheet: "application/vnd.google-apps.spreadsheet",
  template: [
    "application/vnd.google-apps.document",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.google-apps.spreadsheet",
    "application/vnd.google-apps.presentation",
  ].join(","),
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Desktop: run the picker in the system browser and wait for its answer (max. 10 min). */
async function pickInBrowser(kind: PickerKind, title: string | undefined, signal?: AbortSignal): Promise<PickedFile | null> {
  const lang = ["de", "en", "fr"].includes(i18n.language) ? i18n.language : "de";
  const { data } = await api.post<{ id: string }>("/api/google/picker-session", { kind, title, lang });
  const deadline = Date.now() + 10 * 60 * 1000;
  try {
    while (Date.now() < deadline) {
      if (signal?.aborted) return null;
      await sleep(1500);
      if (signal?.aborted) return null;
      const r = await api.get<{ status: "pending" | "done" | "cancelled" | "expired"; file: PickedFile | null }>(`/api/google/picker-session/${data.id}`);
      if (r.data.status === "done") return r.data.file;
      if (r.data.status !== "pending") return null;
    }
    return null;
  } finally {
    if (signal?.aborted) api.delete(`/api/google/picker-session/${data.id}`).catch(() => {});
  }
}

export async function openGooglePicker(kind: PickerKind, title?: string, signal?: AbortSignal): Promise<PickedFile | null> {
  if (hasShell()) return pickInBrowser(kind, title, signal);
  const { data: cfg } = await api.get<PickerConfig>("/api/google/picker-config");
  if (!cfg.available) throw new Error(cfg.error ?? "Google-Picker ist nicht eingerichtet");
  await loadPickerApi();
  const p = window.google.picker;

  let view;
  if (kind === "folder") {
    view = new p.DocsView(p.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes(MIME.folder);
  } else {
    view = new p.DocsView(p.ViewId.DOCS).setIncludeFolders(true);
    if (kind !== "any") view.setMimeTypes(MIME[kind]);
  }

  return new Promise<PickedFile | null>((resolve) => {
    const builder = new p.PickerBuilder()
      .addView(view)
      .setOAuthToken(cfg.accessToken)
      .setDeveloperKey(cfg.apiKey)
      .setAppId(cfg.appId)
      .setOrigin(window.location.origin)
      .setCallback((data: any) => {
        if (data[p.Response.ACTION] === p.Action.PICKED) {
          const d = data[p.Response.DOCUMENTS][0];
          resolve({ id: d[p.Document.ID], name: d[p.Document.NAME], mimeType: d[p.Document.MIME_TYPE], url: d[p.Document.URL] });
        } else if (data[p.Response.ACTION] === p.Action.CANCEL) {
          resolve(null);
        }
      });
    if (title) builder.setTitle(title);
    builder.build().setVisible(true);
  });
}

/** Whether the picker can be offered (server has the keys). Cached per page load. */
let availability: Promise<boolean> | null = null;
export function usePickerAvailable(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    availability ??= api.get<{ pickerAvailable?: boolean }>("/api/google/status")
      .then(r => !!r.data.pickerAvailable).catch(() => false);
    let live = true;
    availability.then(v => { if (live) setOk(v); });
    return () => { live = false; };
  }, []);
  return ok;
}

export function GooglePickerButton({ kind, onPicked, label, title, className = "btn btn-secondary", style }: {
  kind: PickerKind;
  onPicked: (file: PickedFile) => void | Promise<void>;
  label?: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { t } = useTranslation();
  const available = usePickerAvailable();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  if (!available) return null;
  const inBrowser = hasShell();
  const run = async () => {
    setBusy(true); setError("");
    abort.current = new AbortController();
    try {
      const file = await openGooglePicker(kind, title, abort.current.signal);
      if (file) await onPicked(file);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? (e as Error).message);
    } finally { setBusy(false); abort.current = null; }
  };
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button type="button" className={className} style={{ fontSize: 12, whiteSpace: "nowrap", ...style }} disabled={busy} onClick={run}>
        {busy ? (inBrowser ? t("picker.waitingBrowser") : "…") : label ?? t("picker.choose")}
      </button>
      {busy && inBrowser && (
        <span style={{ fontSize: 11, color: "var(--fg-3)" }}>
          {t("picker.browserHint")}{" "}
          <button type="button" className="link-btn" style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", cursor: "pointer", font: "inherit" }}
            onClick={() => abort.current?.abort()}>{t("picker.cancel")}</button>
        </span>
      )}
      {error && <span style={{ fontSize: 11, color: "var(--score-low)" }}>{error}</span>}
    </span>
  );
}

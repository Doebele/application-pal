// Per-user settings in the database instead of the browser.
//
// The Zustand store stays the working copy (instant UI, works offline), but for the
// logged-in user it is loaded from GET /api/settings and every change to a synced
// field is written back (debounced PATCH /api/settings). Several profiles on one
// device — the desktop family case — therefore each keep their own theme, AI
// provider, Drive naming rules and table layout.
//
// API keys: when the server can encrypt (`secretsAvailable`), keys live only on the
// server. Keys still found in localStorage (from before this change) are uploaded
// once for the current user and then removed from the browser. Without server-side
// encryption (web install without SECRETS_KEY/JWT_SECRET) keys stay local as before.
import { useEffect, useRef } from "react";
import { AI_SECRET_FIELDS, type UserSettingsResponse } from "@application-pal/shared";
import { api } from "./api";
import { useUiStore, type AiConfig, type AiSecretProvider } from "./store";

type UiStateShape = ReturnType<typeof useUiStore.getState>;

const SYNCED_KEYS = [
  "theme", "accent", "density", "cardVariant",
  "driveNameFolder", "driveNameDoc",
  "tableColumnOrder", "tableColumnVisibility", "tableColumnPinning", "tableColumnSizing",
] as const;

const KEY_FIELDS: Record<AiSecretProvider, keyof AiConfig> = AI_SECRET_FIELDS;

function aiWithoutKeys(ai: AiConfig): Partial<AiConfig> {
  const out: Partial<AiConfig> = { ...ai };
  for (const f of Object.values(KEY_FIELDS)) delete out[f];
  return out;
}

function snapshot(s: UiStateShape): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of SYNCED_KEYS) out[k] = s[k];
  out.ai = aiWithoutKeys(s.ai);
  return out;
}

/** Mount once inside the logged-in app; remount (key) on user change. */
export function SettingsSync({ userId }: { userId: string }) {
  const ready = useRef(false);
  const lastSent = useRef("");

  useEffect(() => {
    let cancelled = false;
    ready.current = false;
    (async () => {
      const { data } = await api.get<UserSettingsResponse>("/api/settings");
      if (cancelled) return;
      const store = useUiStore.getState();

      // 1. Settings: apply the server copy, or seed the server from this device.
      //    No synced key yet (`{}` or only `onboarding`) = new account → start from defaults, never from the previous
      //    profile's local state. `null` = older account → seed from this device (migration).
      const isFresh = !!data.settings && !("ai" in data.settings) && !SYNCED_KEYS.some(k => k in data.settings!);
      if (isFresh) {
        const init = useUiStore.getInitialState();
        const defaults: Record<string, unknown> = {};
        for (const k of SYNCED_KEYS) defaults[k] = init[k];
        useUiStore.setState({ ...defaults, ai: { ...init.ai } });
        await api.patch("/api/settings", snapshot(useUiStore.getState())).catch(() => {});
      } else if (data.settings) {
        const patch: Record<string, unknown> = {};
        for (const k of SYNCED_KEYS) if (k in data.settings) patch[k] = data.settings[k];
        const serverAi = (data.settings.ai ?? {}) as Partial<AiConfig>;
        // Keys never come from the server; keep local ones only where the server can't hold them.
        const localKeys: Partial<AiConfig> = data.secretsAvailable ? {} : Object.fromEntries(
          Object.values(KEY_FIELDS).map(f => [f, store.ai[f]])) as Partial<AiConfig>;
        useUiStore.setState({ ...patch, ai: { ...store.ai, ...aiWithoutKeys({ ...store.ai, ...serverAi }), ...localKeys } as AiConfig });
      } else {
        await api.patch("/api/settings", snapshot(store)).catch(() => {});
      }

      // 2. Keys: move any left in localStorage to the server, then drop them locally.
      let flags = data.secrets;
      if (data.secretsAvailable) {
        const ai = useUiStore.getState().ai;
        const upload: Partial<Record<AiSecretProvider, string>> = {};
        for (const [p, f] of Object.entries(KEY_FIELDS) as [AiSecretProvider, keyof AiConfig][]) {
          const v = String(ai[f] ?? "").trim();
          if (v && !flags[p]) upload[p] = v;
        }
        if (Object.keys(upload).length) {
          const r = await api.put<{ secrets: typeof flags }>("/api/settings/secrets", { keys: upload }).catch(() => null);
          if (r) flags = r.data.secrets;
        }
        const cleared: Partial<AiConfig> = {};
        for (const f of Object.values(KEY_FIELDS)) cleared[f] = "" as never;
        if (!cancelled) useUiStore.getState().setAi(cleared);
      }
      if (cancelled) return;
      useUiStore.getState().setServerSecrets(data.secretsAvailable, flags);
      lastSent.current = JSON.stringify(snapshot(useUiStore.getState()));
      ready.current = true;
    })().catch(err => console.warn("[settings] load failed", err));
    return () => { cancelled = true; };
  }, [userId]);

  // Write changes back, debounced. Only after the initial load, so the previous
  // profile's local state is never written into a freshly selected profile.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useUiStore.subscribe((s) => {
      if (!ready.current) return;
      const snap = snapshot(s);
      const json = JSON.stringify(snap);
      if (json === lastSent.current) return;
      lastSent.current = json;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { api.patch("/api/settings", snap).catch(() => {}); }, 800);
    });
    return () => { unsub(); if (timer) clearTimeout(timer); };
  }, [userId]);

  return null;
}

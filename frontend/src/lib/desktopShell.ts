// Bridge to the Tauri shell of the desktop app. The page is served by the sidecar
// (http://127.0.0.1:<port>); the capability `sidecar-page` lets it call only the app's own
// commands. In the browser (web version) there is no shell → hasShell() is false.
type Internals = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };

function internals(): Internals | null {
  return (window as unknown as { __TAURI_INTERNALS__?: Internals }).__TAURI_INTERNALS__ ?? null;
}

export const hasShell = (): boolean => internals() !== null;

export async function shellInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const i = internals();
  if (!i) throw new Error("no desktop shell");
  return (await i.invoke(cmd, args)) as T;
}

export type UpdateCheck = { status: "none" | "available" | "busy"; current: string; version?: string };

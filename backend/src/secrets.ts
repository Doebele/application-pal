// Per-user AI API keys, stored encrypted in user_profile.ai_secrets.
//
// Keys never go back to the client. The client still sends its `ai` config with
// every AI call, but with empty key fields; `aiKey()` fills them from the keys
// stored for the user of the current request (AsyncLocalStorage, set by the auth
// middleware). A key sent in the request body still wins, so older clients and
// web installs without an encryption key keep working unchanged.
//
// Encryption key: SECRETS_KEY (desktop: from the OS keychain, passed by the Tauri
// shell), else derived from JWT_SECRET. Without either, server-side keys are
// unavailable and the client keeps them in localStorage as before.
import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import { AI_SECRET_FIELDS, AI_SECRET_PROVIDERS, type AiConfig, type AiSecretProvider } from "@application-pal/shared";

export type AiSecrets = Partial<Record<AiSecretProvider, string>>;

interface RequestCtx { userId: string; secrets: AiSecrets }
export const requestCtx = new AsyncLocalStorage<RequestCtx>();

let cachedKey: Buffer | null | undefined;
export function masterKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.SECRETS_KEY ?? "";
  const jwt = process.env.JWT_SECRET ?? "";
  if (raw) {
    cachedKey = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : crypto.createHash("sha256").update(raw).digest();
  } else if (jwt) {
    cachedKey = crypto.createHash("sha256").update(`application-pal/ai-secrets:${jwt}`).digest();
  } else {
    cachedKey = null;
  }
  return cachedKey;
}

export function encryptSecrets(secrets: AiSecrets): string | null {
  const key = masterKey();
  if (!key) return null;
  const clean: AiSecrets = {};
  for (const p of AI_SECRET_PROVIDERS) if (secrets[p]) clean[p] = secrets[p];
  if (!Object.keys(clean).length) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(clean), "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64")}`;
}

/** Returns {} for an empty, unreadable or foreign blob (e.g. after the key changed). */
export function decryptSecrets(blob: string | null | undefined): AiSecrets {
  const key = masterKey();
  if (!blob || !key || !blob.startsWith("v1:")) return {};
  try {
    const buf = Buffer.from(blob.slice(3), "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    const json = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(json) as AiSecrets;
    const out: AiSecrets = {};
    for (const p of AI_SECRET_PROVIDERS) if (typeof parsed[p] === "string" && parsed[p]) out[p] = parsed[p];
    return out;
  } catch {
    console.warn("[secrets] ai_secrets could not be decrypted (key changed?) — treating as empty");
    return {};
  }
}

export function secretFlags(secrets: AiSecrets): Record<AiSecretProvider, boolean> {
  return Object.fromEntries(AI_SECRET_PROVIDERS.map(p => [p, !!secrets[p]])) as Record<AiSecretProvider, boolean>;
}

/** API key for `provider`: from the request body if set, else the key stored for the current user. */
export function aiKey(ai: Partial<AiConfig> | null | undefined, provider: AiSecretProvider): string {
  const fromBody = ai?.[AI_SECRET_FIELDS[provider]];
  if (fromBody) return fromBody;
  return requestCtx.getStore()?.secrets[provider] ?? "";
}

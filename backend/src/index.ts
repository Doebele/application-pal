import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import {
  applicationImportRequestSchema,
  applicationInsertSchema,
  applicationPatchSchema,
  kbIngestUrlRequestSchema,
  applicationDocumentInsertSchema,
  applicationDocumentPatchSchema,
  applicationActivityInsertSchema,
  applicationContactInsertSchema,
  applicationContactPatchSchema,
  applicationTaskInsertSchema,
  applicationTaskPatchSchema,
  applicationTasks,
  userProfileInsertSchema,
  userDocumentInsertSchema,
  userDocumentPatchSchema,
  applications,
  applicationDocuments,
  applicationActivities,
  applicationContacts,
  userProfile,
  userDocuments,
  googleOAuthTokens,
  kbCompanies,
  kbRoles,
  kbSources,
  kbInsights,
  applicationStageEnum,
  stubDocumentResponseSchema,
  users,
  webauthnCredentials,
  passwordResetTokens,
  invites,
  type AiConfig
} from "@application-pal/shared";
import { PDFParse } from "pdf-parse";
import { and, asc, desc, eq, gte, ilike, inArray, lte, ne, or, isNull, lt, type SQL } from "drizzle-orm";
import { ZodError } from "zod";
import { db } from "./db.js";
import { env, KB_BASE_PATH } from "./env.js";

const app = new Hono();

// ─── JWT Secret (auto-generate if not set in env) ─────────────
let _jwtSecret: string | null = null;
function getJwtSecret(): string {
  if (_jwtSecret) return _jwtSecret;
  if (env.JWT_SECRET) { _jwtSecret = env.JWT_SECRET; return _jwtSecret; }
  // Auto-generate and cache in memory (persists until container restart)
  _jwtSecret = crypto.randomBytes(32).toString("hex");
  console.warn("[auth] JWT_SECRET not set — generated ephemeral secret. Sessions will reset on container restart. Set JWT_SECRET in .env for persistence.");
  return _jwtSecret;
}

// ─── Auth helpers ─────────────────────────────────────────────
const SESSION_TIMEOUT_SECONDS: Record<string, number> = {
  "15m": 900, "1h": 3600, "6h": 21600,
  "24h": 86400, "7d": 604800, "30d": 2592000
};

function issueTokens(c: Parameters<typeof setCookie>[0], userId: string, rememberMe = false, accessTimeout = "15m") {
  const maxAge = SESSION_TIMEOUT_SECONDS[accessTimeout] ?? 900;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const access  = jwt.sign({ userId }, getJwtSecret(), { expiresIn: accessTimeout } as any);
  const refreshExpiry = rememberMe ? "90d" : "1d";
  const refresh = jwt.sign({ userId }, getJwtSecret(), { expiresIn: refreshExpiry });
  const secure  = env.APP_URL.startsWith("https");
  setCookie(c, "access_token",  access,  { httpOnly: true, sameSite: "Lax", path: "/", secure, maxAge });
  setCookie(c, "refresh_token", refresh, { httpOnly: true, sameSite: "Lax", path: "/", secure, ...(rememberMe ? { maxAge: 60 * 60 * 24 * 90 } : {}) });
}

function getUserId(c: Parameters<typeof issueTokens>[0]): string {
  return c.get("userId" as never) as string;
}

async function getSessionTimeout(userId?: string): Promise<string> {
  const where = userId ? eq(userProfile.userId, userId) : undefined;
  const [p] = where
    ? await db.select({ sessionTimeout: userProfile.sessionTimeout }).from(userProfile).where(where).limit(1)
    : await db.select({ sessionTimeout: userProfile.sessionTimeout }).from(userProfile).limit(1);
  return p?.sessionTimeout ?? "15m";
}

function clearTokens(c: Parameters<typeof deleteCookie>[0]) {
  deleteCookie(c, "access_token",  { path: "/" });
  deleteCookie(c, "refresh_token", { path: "/" });
}

async function sendOtpEmail(to: string, code: string) {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    console.warn("[auth] SMTP not configured — OTP code:", code);
    return;
  }
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST, port: env.SMTP_PORT, secure: false,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
  });
  await transport.sendMail({
    from: env.SMTP_USER,
    to,
    subject: "Application Pal — Passwort zurücksetzen",
    text: `Dein Code: ${code}\n\nGültig für 15 Minuten.`,
    html: `<p>Dein Code: <strong style="font-size:24px;letter-spacing:4px">${code}</strong></p><p>Gültig für 15 Minuten.</p>`
  });
}

// In-memory store for WebAuthn challenges (keyed by user id or "login")
const webauthnChallenges = new Map<string, string>();

// ─── Auth Middleware ──────────────────────────────────────────
app.use("/api/*", async (c, next) => {
  const p = c.req.path;
  // Public routes: auth endpoints + google callback + health
  if (p.startsWith("/api/auth/") || p === "/api/google/callback" || p === "/health") {
    return next();
  }
  const token = getCookie(c, "access_token");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { userId: string };
    c.set("userId" as never, payload.userId);
    return next();
  } catch {
    // Try refresh token silently
    const refresh = getCookie(c, "refresh_token");
    if (refresh) {
      try {
        const rp = jwt.verify(refresh, getJwtSecret()) as { userId: string };
        issueTokens(c, rp.userId, false, await getSessionTimeout(rp.userId));
        c.set("userId" as never, rp.userId);
        return next();
      } catch { /* fall through */ }
    }
    return c.json({ error: "Unauthorized" }, 401);
  }
});

// ─── Auth Routes ──────────────────────────────────────────────

// Check if first-run setup is needed
app.get("/api/auth/status", async (c) => {
  const [u] = await db.select({ id: users.id }).from(users).limit(1);
  return c.json({ setup: !!u });
});

// First-run or invited: create a user account
app.post("/api/auth/setup", async (c) => {
  const { email, password, rememberMe, inviteToken } = await c.req.json<{
    email: string; password: string; rememberMe?: boolean; inviteToken?: string;
  }>();

  if (!email || !password || password.length < 8) {
    return c.json({ error: "E-Mail und Passwort (min. 8 Zeichen) erforderlich" }, 400);
  }

  // First user (no users exist yet) can always register
  const [existingAny] = await db.select({ id: users.id }).from(users).limit(1);
  if (existingAny) {
    // Subsequent users: require invite token
    if (!inviteToken) return c.json({ error: "Invite-Token erforderlich" }, 403);
    const [invite] = await db.select().from(invites).where(eq(invites.token, inviteToken)).limit(1);
    if (!invite) return c.json({ error: "Ungültiger Invite-Token" }, 403);
    if (invite.used) return c.json({ error: "Invite-Token bereits verwendet" }, 403);
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) return c.json({ error: "Invite-Token abgelaufen" }, 403);
    if (invite.email && invite.email.toLowerCase() !== email.toLowerCase()) return c.json({ error: "Invite-Token gilt nicht für diese E-Mail" }, 403);
    // Mark invite as used
    await db.update(invites).set({ used: true }).where(eq(invites.id, invite.id));
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
  if (existing) return c.json({ error: "E-Mail bereits registriert" }, 409);

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users).values({ email: email.toLowerCase().trim(), passwordHash }).returning();
  // Create empty profile for new user
  await db.insert(userProfile).values({ userId: user.id }).onConflictDoNothing();
  const timeout = await getSessionTimeout(user.id);
  issueTokens(c, user.id, rememberMe === true, timeout);
  return c.json({ email: user.email });
});

// ─── Invite management ───────────────────────────────────────

// List invites created by current user
app.get("/api/invites", async (c) => {
  const userId = getUserId(c);
  const rows = await db.select().from(invites).where(eq(invites.createdBy, userId)).orderBy(desc(invites.createdAt));
  return c.json(rows);
});

// Create invite
app.post("/api/invites", async (c) => {
  const userId = getUserId(c);
  const { email, expiresInDays = 7 } = await c.req.json<{ email?: string; expiresInDays?: number }>();
  const token = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  const [invite] = await db.insert(invites).values({ token, email: email ?? null, expiresAt, createdBy: userId }).returning();
  return c.json(invite, 201);
});

// Delete invite
app.delete("/api/invites/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  await db.delete(invites).where(and(eq(invites.id, id), eq(invites.createdBy, userId)));
  return c.json({ ok: true });
});

// Login with email + password
app.post("/api/auth/login", async (c) => {
  const { email, password, rememberMe } = await c.req.json<{ email: string; password: string; rememberMe?: boolean }>();
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
  if (!user || !user.passwordHash) return c.json({ error: "Ungültige Anmeldedaten" }, 401);
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return c.json({ error: "Ungültige Anmeldedaten" }, 401);
  issueTokens(c, user.id, rememberMe === true, await getSessionTimeout(user.id));
  return c.json({ email: user.email });
});

// Logout
app.post("/api/auth/logout", (c) => {
  clearTokens(c);
  return c.json({ ok: true });
});

// Current user
app.get("/api/auth/me", async (c) => {
  const token = getCookie(c, "access_token");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { userId } = jwt.verify(token, getJwtSecret()) as { userId: string };
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    return c.json({ email: user.email });
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
});

// Refresh access token
app.post("/api/auth/refresh", async (c) => {
  const refresh = getCookie(c, "refresh_token");
  if (!refresh) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { userId } = jwt.verify(refresh, getJwtSecret()) as { userId: string };
    issueTokens(c, userId, false, await getSessionTimeout(userId));
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
});

// Forgot password — send OTP
app.post("/api/auth/forgot-password", async (c) => {
  const { email } = await c.req.json<{ email: string }>();
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
  // Always return ok to not reveal if email exists
  if (!user) return c.json({ ok: true });
  // Expire old tokens for this user
  await db.delete(passwordResetTokens).where(and(eq(passwordResetTokens.userId, user.id), eq(passwordResetTokens.used, false)));
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await db.insert(passwordResetTokens).values({ userId: user.id, code: codeHash, expiresAt });
  await sendOtpEmail(user.email, code);
  return c.json({ ok: true });
});

// Reset password with OTP
app.post("/api/auth/reset-password", async (c) => {
  const { email, code, newPassword } = await c.req.json<{ email: string; code: string; newPassword: string }>();
  if (!newPassword || newPassword.length < 8) return c.json({ error: "Passwort zu kurz (min. 8 Zeichen)" }, 400);
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
  if (!user) return c.json({ error: "Ungültiger Code" }, 400);
  const [token] = await db.select().from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.userId, user.id), eq(passwordResetTokens.used, false)))
    .orderBy(desc(passwordResetTokens.createdAt)).limit(1);
  if (!token || token.expiresAt < new Date()) return c.json({ error: "Code abgelaufen" }, 400);
  const valid = await bcrypt.compare(code, token.code);
  if (!valid) return c.json({ error: "Ungültiger Code" }, 400);
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
  await db.update(passwordResetTokens).set({ used: true }).where(eq(passwordResetTokens.id, token.id));
  return c.json({ ok: true });
});

// Change password (while logged in)
app.post("/api/auth/change-password", async (c) => {
  const token = getCookie(c, "access_token");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  let userId: string;
  try { userId = (jwt.verify(token, getJwtSecret()) as { userId: string }).userId; }
  catch { return c.json({ error: "Unauthorized" }, 401); }
  const { currentPassword, newPassword } = await c.req.json<{ currentPassword: string; newPassword: string }>();
  if (!newPassword || newPassword.length < 8) return c.json({ error: "Neues Passwort muss min. 8 Zeichen haben" }, 400);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.passwordHash) return c.json({ error: "Kein Passwort hinterlegt" }, 400);
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return c.json({ error: "Aktuelles Passwort falsch" }, 401);
  await db.update(users).set({ passwordHash: await bcrypt.hash(newPassword, 12) }).where(eq(users.id, userId));
  return c.json({ ok: true });
});

// ─── WebAuthn / Passkey Routes ────────────────────────────────
const RP_NAME = "Application Pal";
function getRpId(): string {
  try { return new URL(env.APP_URL).hostname; } catch { return "localhost"; }
}

// Generate registration options
app.get("/api/auth/webauthn/register-options", async (c) => {
  const token = getCookie(c, "access_token");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  let userId: string;
  try { userId = (jwt.verify(token, getJwtSecret()) as { userId: string }).userId; }
  catch { return c.json({ error: "Unauthorized" }, 401); }
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const existingCreds = await db.select().from(webauthnCredentials).where(eq(webauthnCredentials.userId, userId));
  const options = await generateRegistrationOptions({
    rpName: RP_NAME, rpID: getRpId(),
    userName: user.email, userDisplayName: user.email,
    excludeCredentials: existingCreds.map(c => ({ id: c.credentialId, type: "public-key" as const })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" }
  });
  webauthnChallenges.set(userId, options.challenge);
  return c.json(options);
});

// Complete registration
app.post("/api/auth/webauthn/register", async (c) => {
  const token = getCookie(c, "access_token");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  let userId: string;
  try { userId = (jwt.verify(token, getJwtSecret()) as { userId: string }).userId; }
  catch { return c.json({ error: "Unauthorized" }, 401); }
  const { response, deviceName } = await c.req.json<{ response: RegistrationResponseJSON; deviceName?: string }>();
  const challenge = webauthnChallenges.get(userId);
  if (!challenge) return c.json({ error: "Challenge abgelaufen" }, 400);
  try {
    const verification = await verifyRegistrationResponse({
      response, expectedChallenge: challenge,
      expectedOrigin: env.APP_URL, expectedRPID: getRpId(),
      requireUserVerification: false   // allow authenticators without biometric UV
    });
    if (!verification.verified || !verification.registrationInfo) return c.json({ error: "Verifizierung fehlgeschlagen" }, 400);
    const { credential } = verification.registrationInfo;
    await db.insert(webauthnCredentials).values({
      userId, deviceName: deviceName ?? null,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64"),
      counter: credential.counter
    });
    webauthnChallenges.delete(userId);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: "Registrierung fehlgeschlagen: " + String(err) }, 400);
  }
});

// Generate login options
app.get("/api/auth/webauthn/login-options", async (c) => {
  const options = await generateAuthenticationOptions({
    rpID: getRpId(), userVerification: "preferred"
  });
  webauthnChallenges.set("login", options.challenge);
  return c.json(options);
});

// Complete login with passkey
app.post("/api/auth/webauthn/login", async (c) => {
  const { response } = await c.req.json<{ response: AuthenticationResponseJSON }>();
  const challenge = webauthnChallenges.get("login");
  if (!challenge) return c.json({ error: "Challenge abgelaufen" }, 400);
  const [cred] = await db.select().from(webauthnCredentials).where(eq(webauthnCredentials.credentialId, response.id)).limit(1);
  if (!cred) return c.json({ error: "Passkey nicht gefunden" }, 404);
  try {
    const verification = await verifyAuthenticationResponse({
      response, expectedChallenge: challenge,
      expectedOrigin: env.APP_URL, expectedRPID: getRpId(),
      requireUserVerification: false,  // allow authenticators without biometric UV
      credential: {
        id: cred.credentialId,
        publicKey: new Uint8Array(Buffer.from(cred.publicKey, "base64")),
        counter: cred.counter
      }
    });
    if (!verification.verified) return c.json({ error: "Passkey-Verifizierung fehlgeschlagen" }, 401);
    await db.update(webauthnCredentials).set({ counter: verification.authenticationInfo.newCounter }).where(eq(webauthnCredentials.id, cred.id));
    issueTokens(c, cred.userId, false, await getSessionTimeout(cred.userId));
    webauthnChallenges.delete("login");
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: "Anmeldung fehlgeschlagen: " + String(err) }, 400);
  }
});

// List credentials
app.get("/api/auth/webauthn/credentials", async (c) => {
  const token = getCookie(c, "access_token");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  let userId: string;
  try { userId = (jwt.verify(token, getJwtSecret()) as { userId: string }).userId; }
  catch { return c.json({ error: "Unauthorized" }, 401); }
  const creds = await db.select({ id: webauthnCredentials.id, deviceName: webauthnCredentials.deviceName, createdAt: webauthnCredentials.createdAt })
    .from(webauthnCredentials).where(eq(webauthnCredentials.userId, userId)).orderBy(desc(webauthnCredentials.createdAt));
  return c.json(creds);
});

// Delete credential
app.delete("/api/auth/webauthn/credentials/:credId", async (c) => {
  const token = getCookie(c, "access_token");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  let userId: string;
  try { userId = (jwt.verify(token, getJwtSecret()) as { userId: string }).userId; }
  catch { return c.json({ error: "Unauthorized" }, 401); }
  const credId = c.req.param("credId");
  await db.delete(webauthnCredentials).where(and(eq(webauthnCredentials.id, credId), eq(webauthnCredentials.userId, userId)));
  return c.json({ ok: true });
});

// ─── Stage Task Templates ─────────────────────────────────────
const STAGE_TASK_TEMPLATES: Record<string, string[]> = {
  import_validating: [
    "Stellenbeschreibung vollständig erfasst",
    "KI Match Score ausgeführt",
    "Relevanz entschieden"
  ],
  preparing_cv: [
    "Master-CV aktualisiert",
    "Relevante Erfahrungen identifiziert",
    "CV-Dokument erstellt",
    "Formatierung geprüft"
  ],
  preparing_letter: [
    "Anschreiben-Entwurf erstellt",
    "Auf Unternehmen personalisiert",
    "Rechtschreibung kontrolliert",
    "Länge angemessen (max. 1 Seite)"
  ],
  application_sent: [
    "Bewerbung vollständig eingereicht",
    "Bestätigung erhalten",
    "Follow-up-Termin gesetzt",
    "HR-Kontakt notiert"
  ],
  pending: [
    "Unternehmenswebseite analysiert",
    "Glassdoor-Bewertungen geprüft",
    "LinkedIn-Profile der Kontakte angeschaut",
    "Aktuelle News zum Unternehmen gelesen"
  ],
  interview_1: [
    "Logistik bestätigt (Zeit / Ort / Format)",
    "Unterlagen vorbereitet",
    "Rollenspezifische Fragen vorbereitet",
    "STAR-Beispiele aus Erfahrungen notiert",
    "Eigene Rückfragen formuliert"
  ],
  interview_2: [
    "Learnings aus Interview 1 notiert",
    "Gehaltsverhandlung vorbereitet",
    "Referenzen bereit",
    "Fortgeschrittene Fachfragen recherchiert"
  ],
  rejected: [
    "Absage-Grund (falls bekannt) notiert",
    "Learnings für nächste Bewerbungen festgehalten"
  ],
  accepted: [
    "Vertragsdetails geprüft",
    "Startdatum bestätigt",
    "Andere laufende Bewerbungen informiert",
    "Absagen für andere Stellen vorbereitet"
  ]
};

async function initTasksForStage(applicationId: string, stage: string): Promise<void> {
  const templates = STAGE_TASK_TEMPLATES[stage];
  if (!templates?.length) return;
  // Check which default tasks for this stage already exist (avoid duplicates)
  const existing = await db.select({ title: applicationTasks.title })
    .from(applicationTasks)
    .where(and(eq(applicationTasks.applicationId, applicationId), eq(applicationTasks.stage, stage), eq(applicationTasks.isDefault, true)));
  const existingTitles = new Set(existing.map((t) => t.title));
  const newTasks = templates
    .filter((t) => !existingTitles.has(t))
    .map((title, i) => ({ applicationId, stage, title, sortOrder: i, isDefault: true }));
  if (newTasks.length > 0) {
    await db.insert(applicationTasks).values(newTasks);
  }
}

const roleKeywords = [
  "entwickler",
  "developer",
  "software engineer",
  "ux",
  "ui",
  "designer",
  "product design",
  "frontend",
  "backend",
  "full stack",
  "data",
  "analyst",
  "intern"
];

const locationPattern =
  /(?:Standort|Location|in)\s*:?\s*([A-ZÄÖÜ][A-Za-zÄÖÜäöüß -]{2,40})/;
// No /i flag so [A-ZÄÖÜ] stays uppercase-only; no \s so newlines can't bleed in
const companyPattern =
  /(?:Firma|Unternehmen|Company|Arbeitgeber|firma|unternehmen|company|arbeitgeber)\s*:?\s*([A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9&., -]{2,60})/;

const namedEntityPattern =
  /\b([A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9&.-]{2,}(?:[ \t]+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9&.-]{2,}){0,3})\b/;

const stageTriggersAppliedAt = new Set(["application_sent"]);

// ─── Work-type tag detection ──────────────────────────────────────────────────
function pickWorkTags(text: string): string[] {
  const tags: string[] = [];

  // Work location — mutually exclusive (Hybrid > Remote > On-site)
  const isRemote = /\b(remote|homeoffice|home[ -]office|work from home|wfh|dezentral)\b/i.test(text);
  const isHybrid = /\b(hybrid|hybrides?\s+arbeiten|teilweise\s+remote|remote.*flexibel|flexibel.*remote)\b/i.test(text);
  const isOnsite = /\b(vor[ -]ort|on[ -]?site|onsite|in[ -]?office|präsenz(?:arbeit)?|im\s+büro)\b/i.test(text);

  if (isHybrid)      tags.push("Hybrid");
  else if (isRemote) tags.push("Remote");
  else if (isOnsite) tags.push("On-site");

  // Work time — "80-100%", "80%", "60%", etc.
  const VALID_PCTS = new Set([40, 50, 60, 70, 80, 90, 100]);

  // Try range first: "80-100%"
  const rangeMatch = text.match(/\b(\d{2,3})[–\-](\d{2,3})\s*%/);
  if (rangeMatch) {
    const lo = parseInt(rangeMatch[1]);
    const hi = parseInt(rangeMatch[2]);
    if (VALID_PCTS.has(lo) || VALID_PCTS.has(hi)) {
      tags.push(`${rangeMatch[1]}-${rangeMatch[2]}%`);
    }
  }

  // Single percentage if no range found
  if (!tags.some((t) => t.includes("%"))) {
    const singles = text.matchAll(/\b(\d{2,3})\s*%/g);
    for (const m of singles) {
      const num = parseInt(m[1]);
      if (VALID_PCTS.has(num)) { tags.push(`${num}%`); break; }
    }
  }

  // Vollzeit / Fulltime fallback if no % found
  if (!tags.some((t) => t.includes("%"))) {
    if (/\b(vollzeit|full[- ]?time|fulltime)\b/i.test(text)) tags.push("Fulltime");
  }

  return tags;
}

const extractTextFromHtml = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const pickRole = (text: string): string | null => {
  const lines = text.split(/[.!?\n]/).map((line) => line.trim()).filter(Boolean);
  const fromKeyword = lines.find((line) =>
    roleKeywords.some((keyword) => line.toLowerCase().includes(keyword))
  );

  return fromKeyword ?? lines[0] ?? null;
};

const pickCompany = (text: string): string | null => {
  const matched = text.match(companyPattern);
  if (matched?.[1]) return matched[1].trim();
  return text.match(namedEntityPattern)?.[1]?.trim() ?? null;
};

const pickLocation = (text: string): string | null => text.match(locationPattern)?.[1]?.trim() ?? null;

// ─── LLM extraction ───────────────────────────────────────────
const EXTRACTION_PROMPT = `Extract job posting fields. Return ONLY this JSON object, nothing else:
{"company":"<employer name>","role":"<exact job title>","location":"<city or region>","salary":"<range or null>","tags":["<skill1>","<skill2>"],"description":"<2 sentence English summary of responsibilities>"}

Rules:
- company: employer name only, e.g. "St. Galler Kantonalbank"
- role: job title only, e.g. "Digital Experience Designer 80-100%"
- location: city only, e.g. "Sankt Gallen"
- salary: numeric range only or null
- tags: 4-6 skills from the requirements, e.g. ["Figma","UX/UI","Wireframing","Agile"]. Also include one work-location tag if detectable ("Remote", "Hybrid", or "On-site") and the work-time if mentioned ("80-100%", "80%", "Fulltime", etc.)
- description: 2 sentences summarizing what the person will do (not company overview, not ratings)
- IGNORE: ratings, percentages, "bewerben" buttons, review scores, company size, revenue data`;

const EXTRACTION_PROMPT_USER_PREFIX = `Extract fields from this job posting:\n\n`;

type LlmExtracted = {
  company: string | null;
  role: string | null;
  location: string | null;
  salary: string | null;
  tags: string[];
  description: string;
};

/** In Docker, localhost points to the container itself. Rewrite to host.docker.internal so LM Studio on the host is reachable. */
function resolveHostUrl(url: string): string {
  return url.replace(/^(https?:\/\/)localhost(:\d+)?/, "$1host.docker.internal$2");
}

async function extractWithLmStudio(text: string, ai: AiConfig): Promise<LlmExtracted | null> {
  const baseUrl = resolveHostUrl((ai.lmStudioUrl ?? "http://localhost:1234").replace(/\/$/, ""));
  const model = ai.lmStudioModel || undefined;

  const body = {
    model,
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      { role: "user",   content: EXTRACTION_PROMPT_USER_PREFIX + text.slice(0, 6000) }
    ],
    temperature: 0.05,
    max_tokens: 32768  // Qwen3 needs space for its <think> block before JSON output
  };

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(480_000)
  });

  if (!res.ok) {
    console.warn("LM Studio extraction failed:", res.status, await res.text());
    return null;
  }

  const json = await res.json() as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "";
  console.log("[LM Studio] raw response:", raw.slice(0, 500));
  return parseJsonResponse(raw);
}

async function extractWithAnthropic(text: string, ai: AiConfig): Promise<LlmExtracted | null> {
  const apiKey = ai.anthropicApiKey;
  if (!apiKey) return null;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: EXTRACTION_PROMPT,
      messages: [{ role: "user", content: EXTRACTION_PROMPT_USER_PREFIX + text.slice(0, 6000) }]
    }),
    signal: AbortSignal.timeout(480_000)
  });

  if (!res.ok) {
    console.warn("Anthropic extraction failed:", res.status, await res.text());
    return null;
  }

  const json = await res.json() as { content?: { type: string; text: string }[] };
  const raw = json.content?.find((b) => b.type === "text")?.text ?? "";
  return parseJsonResponse(raw);
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  try {
    // strip Qwen3 thinking block <think>...</think>
    let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    // strip markdown fences
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    // extract first JSON object if there's extra text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseJsonResponse(raw: string): LlmExtracted | null {
  try {
    const parsed = extractJsonObject(raw);
    if (!parsed) return null;
    return {
      company:     typeof parsed.company === "string" ? parsed.company : null,
      role:        typeof parsed.role === "string" ? parsed.role : null,
      location:    typeof parsed.location === "string" ? parsed.location : null,
      salary:      typeof parsed.salary === "string" ? parsed.salary : null,
      tags:        Array.isArray(parsed.tags) ? parsed.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 6) : [],
      description: typeof parsed.description === "string" ? parsed.description : ""
    };
  } catch {
    return null;
  }
}

// Remove portal noise before sending to LLM
function cleanJobText(raw: string): string {
  const noisePatterns = [
    /^Logo von .+$/im,
    /^Auf Website des Arbeitgebers bewerben.*$/gim,
    /^\d+[\s,.]?\d*\s*%.*$/gm,           // rating percentages "82 %"
    /^\d+\.\d+$/gm,                       // standalone ratings "3.8"
    /^(Drucken|Teilen|Merken|Bewerben|Mehr anzeigen)$/gim,
    /^(Würden es empfehlen|Befürworten CEO|Karrierechancen|Vergütung.*|Work-Life-Balance|Führungsebene|Kultur.*|Bewertungen für|Bewertungen$)/gim,
    /^(Größe|Gegründet|Art|Branche|Industriezweig|Umsatz|CEO)\s*$/gim,
    /^\d+\s*(bis|to)\s*\d+\s*(Mitarbeiter|employees).*$/gim,
    /^(Aktiengesellschaft|GmbH|AG|Bank|Finanz).*$/gim,
    /^\d+ Bewertungen?$/gim,
    /^[0-9]+\s*\.\s*[0-9]+$/gm,          // "1 . 000" style
    /Deine Qualifikationen für diesen Job.*$/gs,
  ];

  let text = raw;
  for (const p of noisePatterns) text = text.replace(p, "");

  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 2)          // drop very short lines
    .slice(0, 120)                         // cap at ~120 lines
    .join("\n")
    .trim();
}

async function extractWithAi(text: string, ai: AiConfig): Promise<LlmExtracted | null> {
  const cleaned = cleanJobText(text);
  if (ai.provider === "lm-studio") return extractWithLmStudio(cleaned, ai);
  if (ai.provider === "anthropic") return extractWithAnthropic(cleaned, ai);
  return null;
}

type KbExtracted = {
  company: {
    name: string;
    website: string | null;
    industry: string | null;
    size: string | null;
    headquarters: string | null;
    cultureNotes: string | null;
  } | null;
  role: {
    title: string;
    seniority: string | null;
    requirements: string[];
    salaryRange: string | null;
  } | null;
  confidence: number;
  notes: string | null;
};

const KB_EXTRACTION_PROMPT = `Extract a job/company knowledge base entry. Return ONLY this JSON object, nothing else:
{"company":{"name":"<company name>","website":"<url or null>","industry":"<industry or null>","size":"<company size or null>","headquarters":"<city or null>","cultureNotes":"<short notes or null>"},"role":{"title":"<role title>","seniority":"<entry/junior/mid/senior or null>","requirements":["<requirement>"],"salaryRange":"<range or null>"},"confidence":0.0,"notes":"<short extraction note or null>"}

Rules:
- Keep company null if the source only describes a role without a clear employer.
- Keep role null if the source only describes a company.
- requirements must be short, concrete skill or qualification bullets.
- confidence must be between 0 and 1.`;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 12)
    : [];
}

function parseKbJsonResponse(raw: string): KbExtracted | null {
  const parsed = extractJsonObject(raw);
  if (!parsed) return null;

  const companyRaw = parsed.company && typeof parsed.company === "object" && !Array.isArray(parsed.company)
    ? parsed.company as Record<string, unknown>
    : null;
  const roleRaw = parsed.role && typeof parsed.role === "object" && !Array.isArray(parsed.role)
    ? parsed.role as Record<string, unknown>
    : null;

  const companyName = asString(companyRaw?.name);
  const roleTitle = asString(roleRaw?.title);
  const confidence = typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5;

  return {
    company: companyName ? {
      name: companyName,
      website: asString(companyRaw?.website),
      industry: asString(companyRaw?.industry),
      size: asString(companyRaw?.size),
      headquarters: asString(companyRaw?.headquarters),
      cultureNotes: asString(companyRaw?.cultureNotes)
    } : null,
    role: roleTitle ? {
      title: roleTitle,
      seniority: asString(roleRaw?.seniority),
      requirements: asStringArray(roleRaw?.requirements),
      salaryRange: asString(roleRaw?.salaryRange)
    } : null,
    confidence,
    notes: asString(parsed.notes)
  };
}

async function extractKnowledgeBaseWithAnthropic(text: string, ai?: AiConfig): Promise<KbExtracted | null> {
  const apiKey = ai?.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1800,
      system: KB_EXTRACTION_PROMPT,
      messages: [{ role: "user", content: `Extract from this source:\n\n${cleanJobText(text).slice(0, 8000)}` }]
    }),
    signal: AbortSignal.timeout(480_000)
  });

  if (!res.ok) {
    console.warn("Anthropic KB extraction failed:", res.status, await res.text());
    return null;
  }

  const json = await res.json() as { content?: { type: string; text: string }[] };
  const raw = json.content?.find((b) => b.type === "text")?.text ?? "";
  return parseKbJsonResponse(raw);
}

function fallbackKnowledgeBaseExtraction(text: string, sourceUrl?: string): KbExtracted {
  const cleaned = cleanJobText(text);
  const company = pickCompany(cleaned);
  const role = pickRole(cleaned);

  return {
    company: company ? {
      name: company,
      website: sourceUrl ?? null,
      industry: null,
      size: null,
      headquarters: pickLocation(cleaned),
      cultureNotes: cleaned.slice(0, 500) || null
    } : null,
    role: role ? {
      title: role.slice(0, 160),
      seniority: /\b(berufsanfänger|junior|entry|trainee|praktikant)\b/i.test(cleaned) ? "junior" : null,
      requirements: pickWorkTags(cleaned),
      salaryRange: null
    } : null,
    confidence: 0.35,
    notes: "Fallback extraction without Anthropic response"
  };
}

async function extractKnowledgeBase(text: string, ai?: AiConfig, sourceUrl?: string): Promise<KbExtracted> {
  try {
    const llm = await extractKnowledgeBaseWithAnthropic(text, ai);
    if (llm?.company || llm?.role) return llm;
  } catch (error) {
    console.warn("KB LLM extraction failed, falling back to regex:", error);
  }
  return fallbackKnowledgeBaseExtraction(text, sourceUrl);
}

type KbAgentFilePaths = {
  basePath: string;
  indexPath: string;
  sourcePath: string;
  companyPath: string | null;
  rolePath: string | null;
};

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "entry";
}

function yamlValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "null";
  return JSON.stringify(value);
}

function yamlList(values: string[]): string {
  return values.length > 0
    ? values.map((value) => `  - ${yamlValue(value)}`).join("\n")
    : "  []";
}

async function ensureKbTree(): Promise<void> {
  await Promise.all([
    mkdir(path.join(KB_BASE_PATH, "companies"), { recursive: true }),
    mkdir(path.join(KB_BASE_PATH, "roles"), { recursive: true }),
    mkdir(path.join(KB_BASE_PATH, "sources"), { recursive: true })
  ]);
}

async function markdownLinks(dirName: "companies" | "roles"): Promise<string[]> {
  const dir = path.join(KB_BASE_PATH, dirName);
  const files = await readdir(dir).catch(() => []);
  const links: string[] = [];

  for (const file of files.filter((name) => name.endsWith(".md")).sort()) {
    const body = await readFile(path.join(dir, file), "utf8").catch(() => "");
    const title = body.match(/^#\s+(.+)$/m)?.[1] ?? file.replace(/\.md$/, "");
    links.push(`- [${title}](${dirName}/${file})`);
  }

  return links;
}

async function regenerateKbIndex(): Promise<string> {
  const indexPath = path.join(KB_BASE_PATH, "index.md");
  const [companyLinks, roleLinks] = await Promise.all([
    markdownLinks("companies"),
    markdownLinks("roles")
  ]);

  await writeFile(indexPath, [
    "# Application Knowledge Base",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Companies",
    "",
    companyLinks.length > 0 ? companyLinks.join("\n") : "_No companies yet._",
    "",
    "## Roles",
    "",
    roleLinks.length > 0 ? roleLinks.join("\n") : "_No roles yet._",
    ""
  ].join("\n"), "utf8");

  return indexPath;
}

async function writeKbFiles(args: {
  extracted: KbExtracted;
  sourceId: string;
  kind: "url" | "pdf";
  urlOrPath: string;
  rawText: string;
}): Promise<KbAgentFilePaths & { companySlug: string | null; roleSlug: string | null }> {
  await ensureKbTree();

  const companySlug = args.extracted.company ? slugify(args.extracted.company.name) : null;
  const roleSlug = args.extracted.role
    ? slugify(`${args.extracted.company?.name ?? "role"}-${args.extracted.role.title}`)
    : null;

  const companyPath = companySlug ? path.join(KB_BASE_PATH, "companies", `${companySlug}.md`) : null;
  const rolePath = roleSlug ? path.join(KB_BASE_PATH, "roles", `${roleSlug}.md`) : null;
  const sourcePath = path.join(KB_BASE_PATH, "sources", `${args.sourceId}.md`);

  if (args.extracted.company && companyPath) {
    await writeFile(companyPath, [
      "---",
      `slug: ${yamlValue(companySlug)}`,
      `name: ${yamlValue(args.extracted.company.name)}`,
      `website: ${yamlValue(args.extracted.company.website)}`,
      `industry: ${yamlValue(args.extracted.company.industry)}`,
      `size: ${yamlValue(args.extracted.company.size)}`,
      `headquarters: ${yamlValue(args.extracted.company.headquarters)}`,
      `source_id: ${yamlValue(args.sourceId)}`,
      "---",
      "",
      `# ${args.extracted.company.name}`,
      "",
      args.extracted.company.cultureNotes ?? "_No culture notes extracted._",
      ""
    ].join("\n"), "utf8");
  }

  if (args.extracted.role && rolePath) {
    await writeFile(rolePath, [
      "---",
      `slug: ${yamlValue(roleSlug)}`,
      `company_slug: ${yamlValue(companySlug)}`,
      `title: ${yamlValue(args.extracted.role.title)}`,
      `seniority: ${yamlValue(args.extracted.role.seniority)}`,
      `salary_range: ${yamlValue(args.extracted.role.salaryRange)}`,
      `source_id: ${yamlValue(args.sourceId)}`,
      "requirements:",
      yamlList(args.extracted.role.requirements),
      "---",
      "",
      `# ${args.extracted.role.title}`,
      "",
      "## Requirements",
      "",
      args.extracted.role.requirements.length > 0
        ? args.extracted.role.requirements.map((item) => `- ${item}`).join("\n")
        : "_No requirements extracted._",
      ""
    ].join("\n"), "utf8");
  }

  await writeFile(sourcePath, [
    "---",
    `id: ${yamlValue(args.sourceId)}`,
    `kind: ${yamlValue(args.kind)}`,
    `url_or_path: ${yamlValue(args.urlOrPath)}`,
    `company_slug: ${yamlValue(companySlug)}`,
    `role_slug: ${yamlValue(roleSlug)}`,
    `created_at: ${yamlValue(new Date().toISOString())}`,
    "---",
    "",
    `# Source ${args.sourceId}`,
    "",
    args.rawText,
    ""
  ].join("\n"), "utf8");

  const indexPath = await regenerateKbIndex();
  return { basePath: KB_BASE_PATH, indexPath, sourcePath, companyPath, rolePath, companySlug, roleSlug };
}

async function persistKnowledgeBaseSource(args: {
  kind: "url" | "pdf";
  urlOrPath: string;
  rawText: string;
  ai?: AiConfig;
}) {
  const [source] = await db.insert(kbSources).values({
    kind: args.kind,
    urlOrPath: args.urlOrPath,
    status: "pending",
    rawText: args.rawText
  }).returning();

  try {
    const extracted = await extractKnowledgeBase(args.rawText, args.ai, args.kind === "url" ? args.urlOrPath : undefined);
    if (!extracted.company && !extracted.role) {
      throw new Error("No company or role could be extracted.");
    }

    const fileInfo = await writeKbFiles({
      extracted,
      sourceId: source.id,
      kind: args.kind,
      urlOrPath: args.urlOrPath,
      rawText: args.rawText
    });

    const [company] = extracted.company
      ? await db.insert(kbCompanies).values({
          ...extracted.company,
          slug: fileInfo.companySlug,
          agentFilePath: fileInfo.companyPath
        }).returning()
      : [null];
    const [role] = extracted.role
      ? await db.insert(kbRoles).values({
          ...extracted.role,
          companyId: company?.id ?? null,
          slug: fileInfo.roleSlug,
          agentFilePath: fileInfo.rolePath
        }).returning()
      : [null];

    const insightRows = [
      company ? {
        sourceId: source.id,
        entityType: "company" as const,
        entityId: company.id,
        confidence: extracted.confidence.toFixed(2),
        notes: extracted.notes
      } : null,
      role ? {
        sourceId: source.id,
        entityType: "role" as const,
        entityId: role.id,
        confidence: extracted.confidence.toFixed(2),
        notes: extracted.notes
      } : null
    ].filter((row): row is NonNullable<typeof row> => row !== null);

    if (insightRows.length > 0) await db.insert(kbInsights).values(insightRows);
    await db.update(kbSources).set({
      status: "done",
      errorMessage: null,
      agentFilePath: fileInfo.sourcePath
    }).where(eq(kbSources.id, source.id));

    return {
      companyId: company?.id ?? null,
      roleId: role?.id ?? null,
      sourceId: source.id,
      agentFilePaths: {
        company: fileInfo.companyPath,
        role: fileInfo.rolePath,
        source: fileInfo.sourcePath,
        index: fileInfo.indexPath
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Knowledge base ingestion failed.";
    await db.update(kbSources).set({ status: "error", errorMessage: message }).where(eq(kbSources.id, source.id));
    throw error;
  }
}

app.onError((error, c) => {
  if (error instanceof ZodError) {
    return c.json({ error: "Validation failed", details: error.flatten() }, 400);
  }

  console.error(error);
  return c.json({ error: "Internal server error" }, 500);
});

app.get("/health", (c) =>
  c.json({
    status: "ok",
    timestamp: new Date().toISOString()
  })
);

app.get("/api/applications", async (c) => {
  const userId = getUserId(c);
  const showArchived = c.req.query("archived") === "true";
  const rows = await db.select().from(applications)
    .where(showArchived
      ? and(eq(applications.archived, "true"), eq(applications.userId, userId))
      : and(or(isNull(applications.archived), ne(applications.archived, "true")), eq(applications.userId, userId))
    )
    .orderBy(desc(applications.updatedAt));
  return c.json(rows);
});

app.post("/api/applications", zValidator("json", applicationInsertSchema), async (c) => {
  const userId = getUserId(c);
  const payload = c.req.valid("json");
  const stage = payload.stage ?? "import_validating";
  const shouldSetAppliedAt = stageTriggersAppliedAt.has(stage) && !payload.appliedAt;
  const [created] = await db
    .insert(applications)
    .values({
      ...payload,
      userId,
      stage,
      appliedAt: shouldSetAppliedAt ? new Date() : payload.appliedAt
    })
    .returning();

  return c.json(created, 201);
});

app.patch("/api/applications/:id", zValidator("json", applicationPatchSchema), async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const payload = c.req.valid("json");
  const stage = payload.stage;
  const shouldSetAppliedAt =
    stage !== undefined && stageTriggersAppliedAt.has(stage) && !payload.appliedAt;

  const existing = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (existing.length === 0) return c.json({ error: "Application not found" }, 404);

  const [updated] = await db
    .update(applications)
    .set({
      ...payload,
      appliedAt: shouldSetAppliedAt ? new Date() : payload.appliedAt,
      updatedAt: new Date()
    })
    .where(eq(applications.id, id))
    .returning();

  // Auto-log stage changes as activity
  if (stage && stage !== existing[0].stage) {
    const stageLabels: Record<string, string> = {
      import_validating: "Inbox", preparing_cv: "Preparing CV",
      preparing_letter: "Preparing Letter", application_sent: "Submitted",
      pending: "Pending", interview_1: "1st Interview",
      interview_2: "2nd Interview", rejected: "Rejected", accepted: "Accepted"
    };
    await db.insert(applicationActivities).values({
      applicationId: id,
      type: "stage_change",
      title: `Stage → ${stageLabels[stage] ?? stage}`
    });
    // Auto-create tasks for the new stage
    await initTasksForStage(id, stage);
  }

  return c.json(updated);
});

app.delete("/api/applications/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const [deleted] = await db.delete(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).returning();
  if (!deleted) {
    return c.json({ error: "Application not found" }, 404);
  }

  return c.json({ ok: true });
});

// Resolve company logo:
// 1. Use Clearbit autocomplete to find the company domain
// 2. Construct Google favicon URL from the domain (Clearbit logo service is no longer available)
async function resolveCompanyLogo(companyName: string | null): Promise<string | null> {
  if (!companyName) return null;
  try {
    const res = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(companyName)}`,
      { signal: AbortSignal.timeout(4_000) }
    );
    if (!res.ok) return null;
    const companies = await res.json() as Array<{ name: string; domain: string; logo?: string | null }>;
    const domain = companies[0]?.domain;
    if (!domain) return null;
    // Google favicon service — reliable, follows 301 redirect in browser automatically
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  } catch {
    return null;
  }
}

app.post("/api/applications/import", zValidator("json", applicationImportRequestSchema), async (c) => {
  const _userId = getUserId(c);
  const payload = c.req.valid("json");
  let text = payload.text ?? "";

  if (payload.url) {
    try {
      const response = await fetch(payload.url);
      if (response.ok) {
        const html = await response.text();
        text = `${text} ${extractTextFromHtml(html)}`.trim();
      }
    } catch (error) {
      console.warn("Import URL fetch failed", error);
    }
  }

  const normalized = text.trim();

  // Detect work-type tags from raw text (runs for both AI and regex paths)
  const workTags = pickWorkTags(normalized);

  const mergeTags = (aiTags: string[]): string => {
    const lower = aiTags.map((t) => t.toLowerCase());
    const extra = workTags.filter((wt) => !lower.some((t) => t.includes(wt.toLowerCase())));
    return JSON.stringify([...aiTags, ...extra]);
  };

  // Try LLM extraction if AI config provided
  if (payload.ai && payload.ai.provider !== "none") {
    try {
      const llm = await extractWithAi(normalized, payload.ai);
      if (llm) {
        const allTags = mergeTags(llm.tags);
        const logoUrl = await resolveCompanyLogo(llm.company);
        return c.json({
          company:     llm.company,
          role:        llm.role,
          location:    llm.location,
          description: llm.description || normalized.slice(0, 500),
          salary:      llm.salary,
          tags:        JSON.parse(allTags).length > 0 ? allTags : null,
          source:      null,
          logoUrl,
        });
      }
    } catch (error) {
      console.warn("LLM extraction failed, falling back to regex:", error);
    }
  }

  // Regex fallback
  const company = pickCompany(normalized);
  const logoUrl = await resolveCompanyLogo(company);
  return c.json({
    company,
    role:        pickRole(normalized),
    location:    pickLocation(normalized),
    description: normalized.slice(0, 1000),
    salary:      null,
    tags:        workTags.length > 0 ? JSON.stringify(workTags) : null,
    source:      null,
    logoUrl,
  });
});

// ─────────────────────────────────────────────────────────────────
// Knowledge Base
// ─────────────────────────────────────────────────────────────────
function parseListLimit(value: string | undefined): number {
  const parsed = Number(value ?? 25);
  if (!Number.isFinite(parsed)) return 25;
  return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

app.post("/api/kb/ingest/url", zValidator("json", kbIngestUrlRequestSchema), async (c) => {
  const payload = c.req.valid("json");
  const response = await fetch(payload.url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    return c.json({ error: "Source URL could not be fetched." }, 502);
  }

  const html = await response.text();
  const rawText = extractTextFromHtml(html);
  if (!rawText) return c.json({ error: "Source URL did not contain readable text." }, 422);

  const result = await persistKnowledgeBaseSource({
    kind: "url",
    urlOrPath: payload.url,
    rawText,
    ai: payload.ai
  });

  return c.json(result, 201);
});

app.post("/api/kb/ingest/pdf", async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) {
    return c.json({ error: "Multipart field 'file' is required." }, 400);
  }

  const parser = new PDFParse({ data: Buffer.from(await file.arrayBuffer()) });
  const parsed = await parser.getText();
  await parser.destroy();
  const rawText = parsed.text.trim();
  if (!rawText) return c.json({ error: "PDF did not contain readable text." }, 422);

  const result = await persistKnowledgeBaseSource({
    kind: "pdf",
    urlOrPath: file.name || "uploaded.pdf",
    rawText
  });

  return c.json(result, 201);
});

app.get("/api/kb/companies", async (c) => {
  const q = c.req.query("q")?.trim();
  const industry = c.req.query("industry")?.trim();
  const limit = parseListLimit(c.req.query("limit"));
  const conditions: SQL[] = [];

  if (q) conditions.push(or(ilike(kbCompanies.name, `%${q}%`), ilike(kbCompanies.industry, `%${q}%`))!);
  if (industry) conditions.push(ilike(kbCompanies.industry, `%${industry}%`));
  const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);

  const rows = where
    ? await db.select().from(kbCompanies).where(where).orderBy(desc(kbCompanies.extractedAt)).limit(limit)
    : await db.select().from(kbCompanies).orderBy(desc(kbCompanies.extractedAt)).limit(limit);

  return c.json({ data: rows, limit });
});

app.get("/api/kb/companies/:id", async (c) => {
  const id = c.req.param("id");
  const [company] = await db.select().from(kbCompanies).where(eq(kbCompanies.id, id)).limit(1);
  if (!company) return c.json({ error: "Company not found" }, 404);

  const roles = await db.select().from(kbRoles).where(eq(kbRoles.companyId, id)).orderBy(desc(kbRoles.extractedAt));
  const insightConditions: SQL[] = [
    and(eq(kbInsights.entityType, "company"), eq(kbInsights.entityId, id))!
  ];

  for (const role of roles) {
    insightConditions.push(and(eq(kbInsights.entityType, "role"), eq(kbInsights.entityId, role.id))!);
  }

  const insights = await db.select().from(kbInsights).where(or(...insightConditions)!);
  const sourceIds = Array.from(new Set(insights.map((insight) => insight.sourceId).filter((sourceId): sourceId is string => Boolean(sourceId))));
  const sources = sourceIds.length > 0
    ? await db.select().from(kbSources).where(inArray(kbSources.id, sourceIds)).orderBy(desc(kbSources.createdAt))
    : [];

  return c.json({ ...company, roles, sources, insights });
});

app.get("/api/kb/roles", async (c) => {
  const q = c.req.query("q")?.trim();
  const companyId = c.req.query("companyId")?.trim();
  const seniority = c.req.query("seniority")?.trim();
  const limit = parseListLimit(c.req.query("limit"));
  const conditions: SQL[] = [];

  if (q) conditions.push(ilike(kbRoles.title, `%${q}%`));
  if (companyId) conditions.push(eq(kbRoles.companyId, companyId));
  if (seniority) conditions.push(ilike(kbRoles.seniority, `%${seniority}%`));
  const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);

  const rows = where
    ? await db.select().from(kbRoles).where(where).orderBy(desc(kbRoles.extractedAt)).limit(limit)
    : await db.select().from(kbRoles).orderBy(desc(kbRoles.extractedAt)).limit(limit);

  return c.json({ data: rows, limit });
});

app.get("/api/kb/roles/:id", async (c) => {
  const id = c.req.param("id");
  const [role] = await db.select().from(kbRoles).where(eq(kbRoles.id, id)).limit(1);
  if (!role) return c.json({ error: "Role not found" }, 404);

  const company = role.companyId
    ? (await db.select().from(kbCompanies).where(eq(kbCompanies.id, role.companyId)).limit(1))[0] ?? null
    : null;
  const insights = await db.select().from(kbInsights)
    .where(and(eq(kbInsights.entityType, "role"), eq(kbInsights.entityId, id)))
    .orderBy(desc(kbInsights.id));
  const sourceIds = Array.from(new Set(insights.map((insight) => insight.sourceId).filter((sourceId): sourceId is string => Boolean(sourceId))));
  const sources = sourceIds.length > 0
    ? await db.select().from(kbSources).where(inArray(kbSources.id, sourceIds)).orderBy(desc(kbSources.createdAt))
    : [];

  return c.json({ ...role, company, sources, insights });
});

// Proxy LM Studio model list to avoid CORS issues from the browser
app.get("/api/lm-studio/models", async (c) => {
  const baseUrl = resolveHostUrl((c.req.query("url") ?? "http://localhost:1234").replace(/\/$/, ""));
  try {
    const res = await fetch(`${baseUrl}/v1/models`, {
      signal: AbortSignal.timeout(5_000)
    });
    if (!res.ok) return c.json({ models: [] });
    const data = await res.json() as { data?: { id: string }[] };
    const models = (data.data ?? []).map((m) => m.id);
    return c.json({ models });
  } catch {
    return c.json({ models: [] });
  }
});

app.get("/api/applications/:id/cv", (c) => c.json(stubDocumentResponseSchema.parse({ content: null })));
app.get("/api/applications/:id/letter", (c) =>
  c.json(stubDocumentResponseSchema.parse({ content: null }))
);

// ─────────────────────────────────────────────────────────────────
// User Profile
// ─────────────────────────────────────────────────────────────────
app.get("/api/profile", async (c) => {
  const userId = getUserId(c);
  const rows = await db.select().from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  if (rows.length === 0) {
    // Auto-create empty profile for this user
    const [created] = await db.insert(userProfile).values({ userId }).returning();
    return c.json(created);
  }
  return c.json(rows[0]);
});

app.put("/api/profile", zValidator("json", userProfileInsertSchema), async (c) => {
  const userId = getUserId(c);
  const payload = c.req.valid("json");
  const existing = await db.select().from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  if (existing.length === 0) {
    const [created] = await db.insert(userProfile).values({ ...payload, userId }).returning();
    return c.json(created, 201);
  }
  const [updated] = await db.update(userProfile)
    .set({ ...payload, updatedAt: new Date() })
    .where(eq(userProfile.userId, userId))
    .returning();
  return c.json(updated);
});

// ─────────────────────────────────────────────────────────────────
// User Documents (global document vault)
// ─────────────────────────────────────────────────────────────────
app.get("/api/documents", async (c) => {
  const userId = getUserId(c);
  const rows = await db.select().from(userDocuments).where(eq(userDocuments.userId, userId)).orderBy(desc(userDocuments.createdAt));
  return c.json(rows);
});

app.post("/api/documents", zValidator("json", userDocumentInsertSchema), async (c) => {
  const userId = getUserId(c);
  const payload = c.req.valid("json");
  const [doc] = await db.insert(userDocuments).values({ ...payload, userId }).returning();
  return c.json(doc, 201);
});

app.patch("/api/documents/:id", zValidator("json", userDocumentPatchSchema), async (c) => {
  const id = c.req.param("id");
  const payload = c.req.valid("json");
  const [doc] = await db.update(userDocuments)
    .set({ ...payload, updatedAt: new Date() })
    .where(eq(userDocuments.id, id))
    .returning();
  if (!doc) return c.json({ error: "Not found" }, 404);
  return c.json(doc);
});

app.delete("/api/documents/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(userDocuments).where(eq(userDocuments.id, id));
  return c.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────
// Match Score
// ─────────────────────────────────────────────────────────────────
const MATCH_SCORE_SYSTEM_PROMPT = `Du bist ein erfahrener Karriere-Coach. Analysiere die Übereinstimmung zwischen dem Kandidatenprofil und der Stellenbeschreibung. Antworte NUR mit genau diesem JSON-Objekt, nichts anderes davor oder danach:
{"score":<0-100>,"breakdown":{"fachkompetenz":<0-100>,"erfahrung":<0-100>,"soft_skills":<0-100>,"kulturelle_passung":<0-100>},"staerken":["<Stärke 1>","<Stärke 2>","<Stärke 3>"],"luecken":["<Lücke 1>","<Lücke 2>"],"reasoning":"<Ausführliche Begründung in 4-6 Sätzen: Gesamtbewertung, wichtigste Übereinstimmungen, kritische Lücken, Empfehlung>"}

Regeln:
- score: Gesamtübereinstimmung 0-100
- breakdown: Teilbereiche je 0-100
- staerken: max 4 konkrete Stärken des Kandidaten für diese Stelle
- luecken: max 3 Punkte die fehlen oder schwach sind
- reasoning: vollständige Erklärung wie der Score zustande kommt`;

app.post("/api/applications/:id/match-score", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json<{ ai?: AiConfig }>();
  const aiConfig = body.ai;

  if (!aiConfig || aiConfig.provider === "none") {
    return c.json({ error: "AI-Modell erforderlich. Bitte in Settings konfigurieren." }, 400);
  }

  // Load application
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Bewerbung nicht gefunden" }, 404);
  if (!app_.description?.trim()) return c.json({ error: "Keine Stellenbeschreibung vorhanden" }, 400);

  // Load profile
  const [profile] = await db.select().from(userProfile).where(eq(userProfile.userId, userId)).limit(1);

  // Load relevant documents (skills/certs/references)
  const docs = await db.select().from(userDocuments)
    .where(and(eq(userDocuments.userId, userId), inArray(userDocuments.category, ["zeugnis", "referenz", "zertifikat", "portfolio", "lebenslauf"])));

  // Build profile context
  const profileParts: string[] = [];
  if (profile?.masterCv?.trim()) profileParts.push(`## Master-Lebenslauf\n${profile.masterCv.slice(0, 3000)}`);
  if (profile?.linkedinBio?.trim()) profileParts.push(`## LinkedIn Bio\n${profile.linkedinBio.slice(0, 800)}`);
  if (profile?.headline?.trim()) profileParts.push(`## Expertise\n${profile.headline}`);
  if (profile?.personalNotes?.trim()) profileParts.push(`## Persönliche Prioritäten & Gesprächspunkte\n${profile.personalNotes.slice(0, 600)}`);
  if (docs.length > 0) {
    const docTexts = docs.map((d) => `- ${d.name}${d.description ? `: ${d.description}` : ""}${d.tags ? ` [${d.tags}]` : ""}`).join("\n");
    profileParts.push(`## Zeugnisse / Zertifikate / Referenzen\n${docTexts}`);
  }

  if (profileParts.length === 0) {
    return c.json({ error: "Profil ist leer. Bitte Master-CV im Profil ausfüllen." }, 400);
  }

  const profileText = profileParts.join("\n\n");
  const userMessage = `${profileText}\n\n## Stellenbeschreibung\nRolle: ${app_.role}\nUnternehmen: ${app_.company}\n${app_.description.slice(0, 2000)}`;

  // Call AI
  let raw = "";
  try {
    if (aiConfig.provider === "lm-studio") {
      const baseUrl = resolveHostUrl((aiConfig.lmStudioUrl ?? "http://localhost:1234").replace(/\/$/, ""));
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: aiConfig.lmStudioModel || undefined,
          messages: [
            { role: "system", content: MATCH_SCORE_SYSTEM_PROMPT },
            { role: "user", content: userMessage }
          ],
          temperature: 0.1,
          max_tokens: 32768
        }),
        signal: AbortSignal.timeout(480_000)
      });
      if (!res.ok) throw new Error(`LM Studio error: ${res.status}`);
      const json = await res.json() as { choices?: { message?: { content?: string } }[] };
      raw = json.choices?.[0]?.message?.content ?? "";
    } else if (aiConfig.provider === "anthropic") {
      if (!aiConfig.anthropicApiKey) return c.json({ error: "Anthropic API Key fehlt" }, 400);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": aiConfig.anthropicApiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2048,
          system: MATCH_SCORE_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }]
        }),
        signal: AbortSignal.timeout(480_000)
      });
      if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
      const json = await res.json() as { content?: { type: string; text: string }[] };
      raw = json.content?.find((b) => b.type === "text")?.text ?? "";
    }
  } catch (err) {
    console.error("Match score AI call failed:", err);
    return c.json({ error: "KI-Anfrage fehlgeschlagen" }, 502);
  }

  // Parse response — use dedicated parser (parseJsonResponse only handles LlmExtracted shape)
  let result: { score: number; breakdown: { fachkompetenz: number; erfahrung: number; soft_skills: number; kulturelle_passung: number }; staerken: string[]; luecken: string[]; reasoning: string } | null = null;
  try {
    let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const p = JSON.parse(jsonMatch[0]);
      if (typeof p.score === "number") {
        result = {
          score: Math.min(100, Math.max(0, Math.round(p.score))),
          breakdown: {
            fachkompetenz:     Math.round(p.breakdown?.fachkompetenz     ?? p.score),
            erfahrung:         Math.round(p.breakdown?.erfahrung         ?? p.score),
            soft_skills:       Math.round(p.breakdown?.soft_skills       ?? p.score),
            kulturelle_passung: Math.round(p.breakdown?.kulturelle_passung ?? p.score),
          },
          staerken: Array.isArray(p.staerken) ? p.staerken : [],
          luecken:  Array.isArray(p.luecken)  ? p.luecken  : [],
          reasoning: typeof p.reasoning === "string" ? p.reasoning : ""
        };
      }
    }
  } catch { /* handled below */ }

  if (!result) {
    console.error("Invalid match score response:", raw.slice(0, 500));
    return c.json({ error: "KI hat kein gültiges Ergebnis zurückgegeben" }, 502);
  }

  // Persist
  await db.update(applications)
    .set({ matchScore: result.score, matchDetails: JSON.stringify(result), updatedAt: new Date() })
    .where(and(eq(applications.id, id), eq(applications.userId, userId)));

  return c.json(result);
});

// ─────────────────────────────────────────────────────────────────
// Application Documents
// ─────────────────────────────────────────────────────────────────
app.get("/api/applications/:id/documents", async (c) => {
  const id = c.req.param("id");
  const rows = await db.select().from(applicationDocuments)
    .where(eq(applicationDocuments.applicationId, id))
    .orderBy(desc(applicationDocuments.createdAt));
  return c.json(rows);
});

app.post("/api/applications/:id/documents", zValidator("json", applicationDocumentInsertSchema), async (c) => {
  const id = c.req.param("id");
  const payload = c.req.valid("json");
  const [created] = await db.insert(applicationDocuments)
    .values({ ...payload, applicationId: id })
    .returning();
  return c.json(created, 201);
});

app.patch("/api/applications/:id/documents/:docId", zValidator("json", applicationDocumentPatchSchema), async (c) => {
  const docId = c.req.param("docId");
  const payload = c.req.valid("json");
  const [updated] = await db.update(applicationDocuments)
    .set({ ...payload, updatedAt: new Date() })
    .where(eq(applicationDocuments.id, docId))
    .returning();
  if (!updated) return c.json({ error: "Document not found" }, 404);
  return c.json(updated);
});

app.delete("/api/applications/:id/documents/:docId", async (c) => {
  const docId = c.req.param("docId");
  const [deleted] = await db.delete(applicationDocuments).where(eq(applicationDocuments.id, docId)).returning();
  if (!deleted) return c.json({ error: "Document not found" }, 404);
  return c.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────
// Application Activities
// ─────────────────────────────────────────────────────────────────
app.get("/api/applications/:id/activities", async (c) => {
  const id = c.req.param("id");
  const rows = await db.select().from(applicationActivities)
    .where(eq(applicationActivities.applicationId, id))
    .orderBy(desc(applicationActivities.activityDate));
  return c.json(rows);
});

app.post("/api/applications/:id/activities", zValidator("json", applicationActivityInsertSchema), async (c) => {
  const id = c.req.param("id");
  const payload = c.req.valid("json");
  const [created] = await db.insert(applicationActivities)
    .values({ ...payload, applicationId: id })
    .returning();
  return c.json(created, 201);
});

app.delete("/api/applications/:id/activities/:actId", async (c) => {
  const actId = c.req.param("actId");
  const [deleted] = await db.delete(applicationActivities).where(eq(applicationActivities.id, actId)).returning();
  if (!deleted) return c.json({ error: "Activity not found" }, 404);
  return c.json({ ok: true });
});

// ─── Aggregated calendar events ────────────────────────────────────────────────
// Returns all application_activities for a date range, joined with application
// company/role/stage so the frontend can build CalendarEvent objects.
app.get("/api/calendar/events", async (c) => {
  const userId = getUserId(c);
  const { from, to } = c.req.query();
  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate   = to   ? new Date(to)   : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

  const rows = await db
    .select({
      id:              applicationActivities.id,
      applicationId:   applicationActivities.applicationId,
      type:            applicationActivities.type,
      title:           applicationActivities.title,
      description:     applicationActivities.description,
      activityDate:    applicationActivities.activityDate,
      createdAt:       applicationActivities.createdAt,
      company:         applications.company,
      role:            applications.role,
      stage:           applications.stage,
    })
    .from(applicationActivities)
    .leftJoin(applications, eq(applicationActivities.applicationId, applications.id))
    .where(and(
      gte(applicationActivities.activityDate, fromDate),
      lte(applicationActivities.activityDate, toDate),
      eq(applications.userId, userId)
    ))
    .orderBy(asc(applicationActivities.activityDate));

  return c.json(rows);
});

// ─── Google Calendar: list calendars + fetch events ───────────────────────────

// Check whether the stored Google token includes calendar.readonly scope
app.get("/api/google/calendar/status", async (c) => {
  const userId = getUserId(c);
  const [token] = await db.select().from(googleOAuthTokens)
    .where(or(eq(googleOAuthTokens.userId, userId), isNull(googleOAuthTokens.userId)))
    .limit(1);
  if (!token) return c.json({ connected: false, hasCalendarScope: false });
  const scope = token.scope ?? "";
  const hasCalendarScope = scope.includes("calendar");
  return c.json({ connected: true, hasCalendarScope });
});

// List all calendars the user has access to
app.get("/api/google/calendar/list", async (c) => {
  const accessToken = await getDriveAccessToken(getUserId(c));
  if (!accessToken) return c.json({ error: "Google not connected" }, 503);
  const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?fields=items(id,summary,backgroundColor,primary)", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const err = await res.json() as { error?: { message?: string } };
    return c.json({ error: err.error?.message ?? "Calendar API error" }, res.status as 400 | 401 | 403 | 500);
  }
  const data = await res.json() as { items: { id: string; summary: string; backgroundColor?: string; primary?: boolean }[] };
  return c.json(data.items ?? []);
});

// Fetch events from a specific calendar (or primary) for a date range
app.get("/api/google/calendar/events", async (c) => {
  const accessToken = await getDriveAccessToken(getUserId(c));
  if (!accessToken) return c.json({ error: "Google not connected" }, 503);

  const { calendarId = "primary", from, to } = c.req.query();
  const timeMin = from ? new Date(from).toISOString() : new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const timeMax = to   ? new Date(to).toISOString()   : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59).toISOString();

  const params = new URLSearchParams({
    timeMin, timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    fields: "items(id,summary,description,start,end,htmlLink,colorId,location)",
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const err = await res.json() as { error?: { message?: string } };
    return c.json({ error: err.error?.message ?? "Calendar events error" }, res.status as 400 | 401 | 403 | 500);
  }
  const data = await res.json() as { items: unknown[] };
  return c.json(data.items ?? []);
});

// ─────────────────────────────────────────────────────────────────
// Application Contacts
// ─────────────────────────────────────────────────────────────────
app.get("/api/applications/:id/contacts", async (c) => {
  const id = c.req.param("id");
  const rows = await db.select().from(applicationContacts)
    .where(eq(applicationContacts.applicationId, id))
    .orderBy(desc(applicationContacts.createdAt));
  return c.json(rows);
});

app.post("/api/applications/:id/contacts", zValidator("json", applicationContactInsertSchema), async (c) => {
  const id = c.req.param("id");
  const payload = c.req.valid("json");
  const [created] = await db.insert(applicationContacts)
    .values({ ...payload, applicationId: id })
    .returning();
  return c.json(created, 201);
});

app.patch("/api/applications/:id/contacts/:cId", zValidator("json", applicationContactPatchSchema), async (c) => {
  const cId = c.req.param("cId");
  const payload = c.req.valid("json");
  const [updated] = await db.update(applicationContacts)
    .set(payload)
    .where(eq(applicationContacts.id, cId))
    .returning();
  if (!updated) return c.json({ error: "Contact not found" }, 404);
  return c.json(updated);
});

app.delete("/api/applications/:id/contacts/:cId", async (c) => {
  const cId = c.req.param("cId");
  const [deleted] = await db.delete(applicationContacts).where(eq(applicationContacts.id, cId)).returning();
  if (!deleted) return c.json({ error: "Contact not found" }, 404);
  return c.json({ ok: true });
});

// ─── Application Tasks ────────────────────────────────────────
app.get("/api/applications/:id/tasks", async (c) => {
  const id = c.req.param("id");
  const rows = await db.select().from(applicationTasks)
    .where(eq(applicationTasks.applicationId, id))
    .orderBy(applicationTasks.stage, applicationTasks.sortOrder, applicationTasks.createdAt);
  return c.json(rows);
});

// Initialize tasks for a specific stage (called explicitly if needed)
app.post("/api/applications/:id/tasks/init", async (c) => {
  const id = c.req.param("id");
  const { stage } = await c.req.json<{ stage: string }>();
  await initTasksForStage(id, stage);
  const rows = await db.select().from(applicationTasks)
    .where(and(eq(applicationTasks.applicationId, id), eq(applicationTasks.stage, stage)))
    .orderBy(applicationTasks.sortOrder);
  return c.json(rows);
});

app.post("/api/applications/:id/tasks", zValidator("json", applicationTaskInsertSchema), async (c) => {
  const id = c.req.param("id");
  const payload = c.req.valid("json");
  const [created] = await db.insert(applicationTasks)
    .values({ ...payload, applicationId: id, isDefault: false })
    .returning();
  return c.json(created, 201);
});

app.patch("/api/applications/:id/tasks/:taskId", zValidator("json", applicationTaskPatchSchema), async (c) => {
  const taskId = c.req.param("taskId");
  const payload = c.req.valid("json");
  const [updated] = await db.update(applicationTasks)
    .set(payload).where(eq(applicationTasks.id, taskId)).returning();
  if (!updated) return c.json({ error: "Task not found" }, 404);
  return c.json(updated);
});

app.delete("/api/applications/:id/tasks/:taskId", async (c) => {
  const taskId = c.req.param("taskId");
  await db.delete(applicationTasks).where(eq(applicationTasks.id, taskId));
  return c.json({ ok: true });
});

// ─── Stage AI Actions ─────────────────────────────────────────
/** Shared helper: call AI with a system + user prompt, return raw text */
async function callAi(system: string, user: string, ai: AiConfig): Promise<string> {
  if (ai.provider === "lm-studio") {
    const baseUrl = resolveHostUrl((ai.lmStudioUrl ?? "http://localhost:1234").replace(/\/$/, ""));
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ai.lmStudioModel || undefined,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.15,
        max_tokens: 32768
      }),
      signal: AbortSignal.timeout(480_000)
    });
    if (!res.ok) throw new Error(`LM Studio error: ${res.status}`);
    const json = await res.json() as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content ?? "";
  } else if (ai.provider === "anthropic") {
    if (!ai.anthropicApiKey) throw new Error("Anthropic API Key fehlt");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ai.anthropicApiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 8192, system, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(120_000)
    });
    if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
    const json = await res.json() as { content?: { type: string; text: string }[] };
    return json.content?.find((b) => b.type === "text")?.text ?? "";
  }
  throw new Error("Kein KI-Modell konfiguriert");
}

/** Strip <think> block + markdown fences, extract JSON object */
function extractJson(raw: string): unknown {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON found in response");
  return JSON.parse(m[0]);
}

// ── AI Result Cache Helper ───────────────────────────────────────
async function persistAiResult(appId: string, key: string, data: Record<string, unknown>) {
  const [row] = await db.select({ c: applications.aiResultsCache }).from(applications).where(eq(applications.id, appId)).limit(1);
  const cache: Record<string, unknown> = row?.c ? JSON.parse(row.c) : {};
  cache[key] = { ...data, _savedAt: new Date().toISOString() };
  await db.update(applications).set({ aiResultsCache: JSON.stringify(cache) }).where(eq(applications.id, appId));
}

// CV Highlights
app.post("/api/applications/:id/ai/cv-highlights", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { ai } = await c.req.json<{ ai: AiConfig }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const [profile] = await db.select().from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  if (!profile?.masterCv?.trim()) return c.json({ error: "Kein Master-CV im Profil hinterlegt" }, 400);
  const system = `Du bist ein Karriere-Coach. Analysiere den Lebenslauf des Kandidaten und die Stellenbeschreibung.
Antworte NUR mit diesem JSON:
{
  "highlights": ["<Erfahrung/Skill besonders relevant>", ...],  // 5-8 Punkte
  "keywords": ["<Keyword aus Stellenbeschreibung das im CV vorkommt>", ...],  // 3-6
  "gaps": ["<Anforderung im Job die nicht oder schwach im CV steht>", ...]  // 2-4
}`;
  const user = `## Lebenslauf\n${profile.masterCv.slice(0, 4000)}\n\n## Stellenbeschreibung\nRolle: ${app_.role}\n${app_.description?.slice(0, 2000) ?? ""}`;
  try {
    const raw = await callAi(system, user, ai);
    const parsed = extractJson(raw) as { highlights: string[]; keywords: string[]; gaps: string[] };
    await persistAiResult(id, "cv-highlights", parsed as Record<string, unknown>);
    return c.json(parsed);
  } catch (err) {
    console.error("cv-highlights error:", err);
    return c.json({ error: "KI-Anfrage fehlgeschlagen" }, 502);
  }
});

// CV Google Doc — creates a Google Doc from Master-CV with a "Für diese Stelle relevant" section
app.post("/api/applications/:id/ai/cv-doc", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { ai } = await c.req.json<{ ai: AiConfig }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const [profile] = await db.select().from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  if (!profile?.masterCv?.trim()) return c.json({ error: "Kein Master-CV im Profil hinterlegt" }, 400);
  const accessTokenForDoc = await getDriveAccessToken(userId);
  if (!accessTokenForDoc) return c.json({ error: "Google Drive nicht verbunden" }, 400);

  // Generate highlights to prepend
  let highlightText = "";
  try {
    const system = `Analysiere den Lebenslauf und die Stellenbeschreibung. Antworte NUR mit JSON:
{"highlights":["<Erfahrung besonders relevant>"],"keywords":["<Keyword>"]}`;
    const user = `Lebenslauf:\n${profile.masterCv.slice(0, 3000)}\n\nStelle: ${app_.role} bei ${app_.company}\n${app_.description?.slice(0, 1500) ?? ""}`;
    const raw = await callAi(system, user, ai);
    const p = extractJson(raw) as { highlights: string[]; keywords: string[] };
    highlightText = `═══ FÜR DIESE STELLE BESONDERS RELEVANT: ${app_.role} @ ${app_.company} ═══\n\n`;
    if (p.highlights?.length) {
      highlightText += p.highlights.map((h: string) => `✓ ${h}`).join("\n") + "\n";
    }
    if (p.keywords?.length) {
      highlightText += `\nSchlüsselbegriffe: ${p.keywords.join(", ")}\n`;
    }
    highlightText += "\n════════════════════════════════════════════════════════\n\n";
  } catch { /* skip highlights if AI fails */ }

  const docTitle = `CV – ${app_.role} @ ${app_.company}`;
  const docContent = highlightText + profile.masterCv;

  try {
    const docRes = await fetch("https://docs.googleapis.com/v1/documents", {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessTokenForDoc}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: docTitle })
    });
    if (!docRes.ok) return c.json({ error: "Google Doc konnte nicht erstellt werden" }, 502);
    const doc = await docRes.json() as { documentId: string };
    const docUrl = `https://docs.google.com/document/d/${doc.documentId}/edit`;

    // Insert content
    await fetch(`https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessTokenForDoc}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: docContent } }] })
    });

    return c.json({ docUrl, title: docTitle });
  } catch (err) {
    console.error("cv-doc error:", err);
    return c.json({ error: "Google Doc Erstellung fehlgeschlagen" }, 502);
  }
});

// Cover Letter generation (+ optional Google Doc)
app.post("/api/applications/:id/ai/cover-letter", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { ai, createDoc } = await c.req.json<{ ai: AiConfig; createDoc?: boolean }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const [profile] = await db.select().from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  const system = `Du bist ein erfahrener HR-Berater. Schreibe ein professionelles, prägnantes Bewerbungsanschreiben (max. 350 Wörter).
Erkenne automatisch die Sprache der Stellenbeschreibung und verwende dieselbe Sprache.
Antworte NUR mit JSON: { "subject": "<Email-Betreff>", "body": "<Anschreiben-Text mit Absätzen durch \\n\\n getrennt>" }`;
  const candidateParts = [];
  if (profile?.headline) candidateParts.push(`Expertise: ${profile.headline}`);
  if (profile?.masterCv) candidateParts.push(`Lebenslauf:\n${profile.masterCv.slice(0, 3000)}`);
  if (profile?.personalNotes) candidateParts.push(`Persönliche Stichpunkte: ${profile.personalNotes.slice(0, 400)}`);
  const user = `## Kandidatenprofil\n${candidateParts.join("\n\n")}\n\n## Stelle\nRolle: ${app_.role}\nUnternehmen: ${app_.company}\nOrt: ${app_.location ?? ""}\nGehalt: ${app_.salary ?? ""}\n\n## Stellenbeschreibung\n${app_.description?.slice(0, 2000) ?? ""}`;
  try {
    const raw = await callAi(system, user, ai);
    const parsed = extractJson(raw) as { subject: string; body: string };
    let docUrl: string | null = null;
    if (createDoc) {
      const coverLetterToken = await getDriveAccessToken(userId);
      if (coverLetterToken) {
        const docRes = await fetch("https://docs.googleapis.com/v1/documents", {
          method: "POST",
          headers: { "Authorization": `Bearer ${coverLetterToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ title: `Anschreiben – ${app_.role} @ ${app_.company}` })
        });
        if (docRes.ok) {
          const doc = await docRes.json() as { documentId: string };
          docUrl = `https://docs.google.com/document/d/${doc.documentId}/edit`;
          // Insert text into the doc
          await fetch(`https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${coverLetterToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: `${parsed.subject}\n\n${parsed.body}` } }] })
          });
        }
      }
    }
    return c.json({ ...parsed, docUrl });
  } catch (err) {
    console.error("cover-letter error:", err);
    return c.json({ error: "KI-Anfrage fehlgeschlagen" }, 502);
  }
});

// Email Draft
app.post("/api/applications/:id/ai/email-draft", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { ai, type } = await c.req.json<{ ai: AiConfig; type: "application" | "followup" | "decline" | "feedback" | "linkedin" }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const [profile] = await db.select().from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  const typeDescriptions = {
    application: "eine Bewerbungs-Email (kurze Begleit-Email zur Bewerbung)",
    followup: "eine freundliche Follow-up-Email (3-4 Wochen nach Bewerbung, höflich nach Stand fragen)",
    decline: "eine höfliche Absage-Email (du hast eine andere Stelle angenommen)",
    feedback: "eine höfliche Email um konstruktives Feedback zur Absage zu bitten (kurz und professionell, max. 100 Wörter im Body)",
    linkedin: "eine kurze LinkedIn-Vernetzungsnachricht an HR/Hiring Manager (max. 300 Zeichen, freundlich und professionell)"
  };
  const system = `Schreibe ${typeDescriptions[type]}. Professionell, klar, nicht zu lang (max. 150 Wörter im Body, ausser bei linkedin: max. 300 Zeichen).
Erkenne die Sprache der Stellenbeschreibung und schreibe in dieser Sprache.
Antworte NUR mit JSON: { "subject": "<Betreff>", "body": "<Email-Text>" }`;
  const contacts = await db.select().from(applicationContacts).where(eq(applicationContacts.applicationId, id)).limit(1);
  const contact = contacts[0];
  const user = `Absender: ${profile?.name ?? ""} (${profile?.email ?? ""})\nEmpfänger: ${contact ? `${contact.name}${contact.role ? ` (${contact.role})` : ""}` : "HR-Team"} bei ${app_.company}\nStelle: ${app_.role}\nStellenbeschreibung: ${app_.description?.slice(0, 500) ?? ""}`;
  try {
    const raw = await callAi(system, user, ai);
    const parsed = extractJson(raw) as { subject: string; body: string };
    return c.json(parsed);
  } catch (err) {
    console.error("email-draft error:", err);
    return c.json({ error: "KI-Anfrage fehlgeschlagen" }, 502);
  }
});

// Interview Preparation (Chris Voss method + STAR + role-specific)
app.post("/api/applications/:id/ai/interview-prep", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { ai } = await c.req.json<{ ai: AiConfig }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const [profile] = await db.select().from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  const system = `Du bist ein erfahrener Interview-Coach und kennst die Methoden von Chris Voss ("Never Split the Difference").
Erstelle eine umfassende Interviewvorbereitung basierend auf der Rolle und dem Kandidatenprofil.
Antworte NUR mit diesem JSON:
{
  "rollenFragen": ["<Frage 1>", ...],
  "starBeispiele": [
    { "frage": "<typische Verhaltensfrage>", "situation": "<aus dem CV>", "aufgabe": "<Aufgabe>", "aktion": "<konkrete Aktion>", "ergebnis": "<messbares Ergebnis>" }
  ],
  "vossFragenWhatHow": ["<What/How-Frage 1>", ...],
  "rueckfragen": ["<Rückfrage an Interviewer 1>", ...]
}
Regeln:
- rollenFragen: 8-10 rollenspezifische Fragen (keine allgemeinen wie "Stellen Sie sich vor")
- starBeispiele: 3 STAR-Beispiele, nutze konkrete Erfahrungen aus dem Lebenslauf
- vossFragenWhatHow: 5-6 Fragen die mit "Was" oder "Wie" (oder "What"/"How") beginnen, taktisch intelligent (nach Erwartungen, Entscheidungsprozessen, Erfolgsmetriken fragen)
- rueckfragen: 5 gute Rückfragen die Interesse und Vorbereitung zeigen`;
  const user = `Rolle: ${app_.role}\nUnternehmen: ${app_.company}\nBeschreibung: ${app_.description?.slice(0, 2000) ?? ""}\n\nKandidatenprofil:\n${profile?.masterCv?.slice(0, 2500) ?? "Kein Profil hinterlegt"}`;
  try {
    const raw = await callAi(system, user, ai);
    const parsed = extractJson(raw) as {
      rollenFragen: string[];
      starBeispiele: { frage: string; situation: string; aufgabe: string; aktion: string; ergebnis: string }[];
      vossFragenWhatHow: string[];
      rueckfragen: string[];
    };
    return c.json(parsed);
  } catch (err) {
    console.error("interview-prep error:", err);
    return c.json({ error: "KI-Anfrage fehlgeschlagen" }, 502);
  }
});

// Export Interview Prep to Google Doc
app.post("/api/applications/:id/ai/interview-prep/export-doc", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { interviewPrep } = await c.req.json<{ interviewPrep: {
    rollenFragen: string[];
    starBeispiele: { frage: string; situation: string; aufgabe: string; aktion: string; ergebnis: string }[];
    vossFragenWhatHow: string[];
    rueckfragen: string[];
  } }>();
  if (!interviewPrep) return c.json({ error: "Keine Interview-Daten übergeben" }, 400);

  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const token = await getDriveAccessToken(userId);
  if (!token) return c.json({ error: "Google Drive nicht verbunden" }, 400);

  const sep = "═".repeat(48);
  const date = new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  let content = `Interview-Vorbereitung: ${app_.role} @ ${app_.company}\n${date}\n\n`;
  content += `${sep}\nROLLENSPEZIFISCHE FRAGEN\n${sep}\n\n`;
  content += interviewPrep.rollenFragen.map((q, i) => `${i + 1}. ${q}`).join("\n") + "\n\n";
  content += `${sep}\nCHRIS VOSS "WHAT / HOW"-FRAGEN\n${sep}\nTaktische offene Fragen nach "Never Split the Difference"\n\n`;
  content += interviewPrep.vossFragenWhatHow.map(q => `→ ${q}`).join("\n") + "\n\n";
  content += `${sep}\nSTAR-BEISPIELE\n${sep}\n\n`;
  content += interviewPrep.starBeispiele.map((s, i) =>
    `Beispiel ${i + 1}: ${s.frage}\nS (Situation): ${s.situation}\nT (Aufgabe): ${s.aufgabe}\nA (Aktion): ${s.aktion}\nR (Ergebnis): ${s.ergebnis}`
  ).join("\n\n") + "\n\n";
  content += `${sep}\nMEINE RÜCKFRAGEN\n${sep}\n\n`;
  content += interviewPrep.rueckfragen.map(q => `? ${q}`).join("\n");

  const docTitle = `Interview-Prep – ${app_.role} @ ${app_.company}`;
  try {
    const docRes = await fetch("https://docs.googleapis.com/v1/documents", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: docTitle })
    });
    if (!docRes.ok) {
      const errBody = await docRes.json().catch(() => ({})) as { error?: { message?: string } };
      const msg = errBody?.error?.message ?? `HTTP ${docRes.status}`;
      return c.json({ error: `Google Docs API: ${msg}` }, 502);
    }
    const doc = await docRes.json() as { documentId: string };

    await fetch(`https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: content } }] })
    });

    // Move to application Drive folder if one exists
    if (app_.googleFolderId) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${doc.documentId}?addParents=${app_.googleFolderId}&removeParents=root&fields=id`, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${token}` }
      });
    }

    const docUrl = `https://docs.google.com/document/d/${doc.documentId}/edit`;
    // Save as applicationDocument
    await db.insert(applicationDocuments).values({
      applicationId: id, type: "other", name: docTitle,
      status: "draft", googleDocId: doc.documentId, googleDocUrl: docUrl
    });
    return c.json({ docUrl, title: docTitle });
  } catch (err) {
    console.error("interview-prep export-doc error:", err);
    return c.json({ error: "Google Doc Erstellung fehlgeschlagen" }, 502);
  }
});

// Salary Negotiation Tips
app.post("/api/applications/:id/ai/salary-tips", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { ai } = await c.req.json<{ ai: AiConfig }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const system = `Du bist ein Gehaltsverhandlungs-Coach mit Chris Voss Methodik. Gib konkrete, taktische Tipps.
Antworte NUR mit JSON:
{
  "markteinschätzung": "<1-2 Sätze zum Marktgehalt für diese Rolle>",
  "taktiken": ["<Taktik 1>", ...],
  "formulierungen": ["<konkrete Formulierung>", ...],
  "vossAnker": "<Chris Voss Taktik: Wie man einen hohen Anker setzt ohne zu bluffen>"
}`;
  const user = `Rolle: ${app_.role}\nUnternehmen: ${app_.company}\nGenanntes Gehalt in Stellenanzeige: ${app_.salary ?? "nicht angegeben"}\nLocation: ${app_.location ?? ""}`;
  try {
    const raw = await callAi(system, user, ai);
    const parsed = extractJson(raw) as { markteinschätzung: string; taktiken: string[]; formulierungen: string[]; vossAnker: string };
    await persistAiResult(id, "salary-tips", parsed as Record<string, unknown>);
    return c.json(parsed);
  } catch (err) {
    console.error("salary-tips error:", err);
    return c.json({ error: "KI-Anfrage fehlgeschlagen" }, 502);
  }
});

// Gehalts-Check Schweiz (Inbox stage)
// ── Glassdoor / Unternehmens-Rating ──
app.post("/api/applications/:id/ai/glassdoor-check", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { ai } = await c.req.json<{ ai: AiConfig }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);

  const companySlug = (app_.company ?? "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const glassdoorUrl = `https://www.glassdoor.com/Search/results.htm?keyword=${encodeURIComponent(app_.company ?? "")}`;
  const kununuUrl   = `https://www.kununu.com/search?q=${encodeURIComponent(app_.company ?? "")}`;
  const linkedinUrl = `https://www.linkedin.com/company/${companySlug}`;

  const system = `Du bist ein Unternehmens-Analyst. Schätze basierend auf deinen Trainingsdaten das Glassdoor-Rating und weitere Kennzahlen für das genannte Unternehmen.
Antworte NUR mit diesem JSON (alle Felder pflichtend):
{
  "rating": number_or_null,
  "reviewCount": number_or_null,
  "ceoApproval": number_or_null,
  "recommendToFriend": number_or_null,
  "confidence": "hoch" | "mittel" | "niedrig",
  "summary": "<2-3 Sätze zu Unternehmenskultur und Mitarbeiterzufriedenheit>",
  "pros": ["<string>"],
  "cons": ["<string>"],
  "hinweis": "<kurze Erklärung über Zuverlässigkeit der Daten>"
}
Felder sind null wenn keine verlässlichen Daten vorhanden. confidence="niedrig" für unbekannte/sehr kleine Unternehmen.`;

  const user = `Unternehmen: ${app_.company}\nBranche (aus Stellenbeschreibung): ${app_.description?.slice(0, 300) ?? "unbekannt"}`;

  try {
    const raw = await callAi(system, user, ai);
    const parsed = extractJson(raw) as {
      rating: number | null; reviewCount: number | null;
      ceoApproval: number | null; recommendToFriend: number | null;
      confidence: string; summary: string; pros: string[]; cons: string[]; hinweis: string;
    };
    const result = { ...parsed, glassdoorUrl, kununuUrl, linkedinUrl, updatedAt: new Date().toISOString(), manuallyEdited: false };
    // Persist to DB
    await db.update(applications).set({ glassdoorData: JSON.stringify(result) }).where(eq(applications.id, id));
    return c.json(result);
  } catch (err) {
    console.error("glassdoor-check error:", err);
    return c.json({ error: "KI-Anfrage fehlgeschlagen" }, 502);
  }
});

// Manuell gespeichertes Rating aktualisieren
app.patch("/api/applications/:id/ai/glassdoor-check", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json<{ rating?: number | null; reviewCount?: number | null; glassdoorUrl?: string }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const existing = app_.glassdoorData ? JSON.parse(app_.glassdoorData) : {};
  const updated = { ...existing, ...body, manuallyEdited: true, updatedAt: new Date().toISOString() };
  await db.update(applications).set({ glassdoorData: JSON.stringify(updated) }).where(and(eq(applications.id, id), eq(applications.userId, userId)));
  return c.json(updated);
});

app.post("/api/applications/:id/ai/kununu-check", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { ai } = await c.req.json<{ ai: AiConfig }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);

  const companySlug = (app_.company ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const urlEstimate = `https://www.kununu.com/de/${companySlug}`;

  const system = `Du bist ein Unternehmens-Analyst. Schätze basierend auf deinen Trainingsdaten das Kununu-Rating des genannten Unternehmens (Schweiz/DACH-Raum).
Antworte NUR mit diesem JSON:
{
  "rating": number_or_null,
  "reviewCount": number_or_null,
  "confidence": "hoch" | "mittel" | "niedrig",
  "summary": "<2 Sätze zur Mitarbeiterzufriedenheit laut Kununu>",
  "hinweis": "<kurze Erklärung zur Verlässlichkeit>"
}
rating ist null wenn keine Daten bekannt. confidence="niedrig" für unbekannte/sehr kleine Unternehmen.`;
  const user = `Unternehmen: ${app_.company}\nBeschreibung: ${app_.description?.slice(0, 300) ?? ""}`;

  try {
    const raw = await callAi(system, user, ai);
    const parsed = extractJson(raw) as { rating: number | null; reviewCount: number | null; confidence: string; summary: string; hinweis: string };
    const result = { ...parsed, url: urlEstimate, updatedAt: new Date().toISOString(), manuallyEdited: false };
    await db.update(applications).set({ kununuData: JSON.stringify(result) }).where(eq(applications.id, id));
    return c.json(result);
  } catch (err) {
    console.error("kununu-check error:", err);
    return c.json({ error: "KI-Anfrage fehlgeschlagen" }, 502);
  }
});

app.patch("/api/applications/:id/ai/kununu-check", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json<{ rating?: number | null; reviewCount?: number | null; url?: string }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const existing = app_.kununuData ? JSON.parse(app_.kununuData) : {};
  const updated = { ...existing, ...body, manuallyEdited: true, updatedAt: new Date().toISOString() };
  await db.update(applications).set({ kununuData: JSON.stringify(updated) }).where(and(eq(applications.id, id), eq(applications.userId, userId)));
  return c.json(updated);
});

app.post("/api/applications/:id/ai/linkedin-profile", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { ai } = await c.req.json<{ ai: AiConfig }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);

  const companySlug = (app_.company ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const urlEstimate = `https://www.linkedin.com/company/${companySlug}`;

  const system = `Du bist ein Unternehmens-Analyst. Ermittle das LinkedIn-Firmenprofil des genannten Unternehmens.
Antworte NUR mit diesem JSON:
{
  "url": "<LinkedIn-Unternehmensseiten-URL, z.B. https://www.linkedin.com/company/firmenname>",
  "employeeCount": "<geschätzte Mitarbeiterzahl, z.B. '500–1000' oder null>",
  "description": "<1-2 Sätze zum Unternehmen>",
  "hinweis": "<Hinweis ob URL bekannt oder nur geschätzt>"
}`;
  const user = `Unternehmen: ${app_.company}\nBeschreibung: ${app_.description?.slice(0, 300) ?? ""}`;

  try {
    const raw = await callAi(system, user, ai);
    const parsed = extractJson(raw) as { url: string; employeeCount?: string; description?: string; hinweis: string };
    const result = { ...parsed, url: parsed.url || urlEstimate, updatedAt: new Date().toISOString(), manuallyEdited: false };
    await db.update(applications).set({ linkedinData: JSON.stringify(result) }).where(eq(applications.id, id));
    return c.json(result);
  } catch (err) {
    console.error("linkedin-profile error:", err);
    return c.json({ error: "KI-Anfrage fehlgeschlagen" }, 502);
  }
});

app.patch("/api/applications/:id/ai/linkedin-profile", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json<{ url?: string }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const existing = app_.linkedinData ? JSON.parse(app_.linkedinData) : {};
  const updated = { ...existing, ...body, manuallyEdited: true, updatedAt: new Date().toISOString() };
  await db.update(applications).set({ linkedinData: JSON.stringify(updated) }).where(and(eq(applications.id, id), eq(applications.userId, userId)));
  return c.json(updated);
});

app.post("/api/applications/:id/ai/salary-check", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { ai } = await c.req.json<{ ai: AiConfig }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const system = `Du bist ein Schweizer Lohnexperte. Analysiere die Stellenausschreibung und ermittle ein realistisches Lohnband für die Schweiz. Berücksichtige: Titel/Level, Branche, Region (falls angegeben), Unternehmensgrösse. Antworte NUR mit JSON:
{ "lohnband": { "min": number, "max": number, "median": number }, "waehrung": "CHF", "basis": "Jahresbrutto", "begruendung": "<string 2-3 Sätze>", "faktoren": ["<string>"] }`;
  const user = `Stelle: ${app_.role}\nUnternehmen: ${app_.company}\nBranche (falls erkennbar): aus Stellenbeschreibung ableiten\nStellenbeschreibung:\n${app_.description?.slice(0, 2000) ?? ""}`;
  try {
    const raw = await callAi(system, user, ai);
    const parsed = extractJson(raw) as { lohnband: { min: number; max: number; median: number }; waehrung: string; basis: string; begruendung: string; faktoren: string[] };
    await persistAiResult(id, "salary-check", parsed as Record<string, unknown>);
    return c.json(parsed);
  } catch (err) {
    console.error("salary-check error:", err);
    return c.json({ error: "KI-Anfrage fehlgeschlagen" }, 502);
  }
});

// Export Salary Check to Google Doc
app.post("/api/applications/:id/ai/salary-check/export-doc", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { salaryCheck } = await c.req.json<{ salaryCheck: { lohnband: { min: number; max: number; median: number }; waehrung: string; basis: string; begruendung: string; faktoren: string[] } }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const salaryDocToken = await getDriveAccessToken(userId);
  if (!salaryDocToken) return c.json({ error: "Google Drive nicht verbunden" }, 400);
  const date = new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  const sep = "─".repeat(40);
  let content = `Gehalts-Check Schweiz: ${app_.role} @ ${app_.company}\n${date}\n\n`;
  content += `${sep}\nLOHNBAND\n${sep}\n\n`;
  content += `Minimum:  CHF ${salaryCheck.lohnband.min.toLocaleString("de-CH")}\n`;
  content += `Median:   CHF ${salaryCheck.lohnband.median.toLocaleString("de-CH")}\n`;
  content += `Maximum:  CHF ${salaryCheck.lohnband.max.toLocaleString("de-CH")}\n`;
  content += `Basis: ${salaryCheck.basis}\n\n`;
  content += `${sep}\nBEGRÜNDUNG\n${sep}\n\n${salaryCheck.begruendung}\n\n`;
  if (salaryCheck.faktoren.length > 0) {
    content += `${sep}\nEINFLUSSFAKTOREN\n${sep}\n\n`;
    content += salaryCheck.faktoren.map(f => `• ${f}`).join("\n");
  }
  const docTitle = `Gehalts-Check – ${app_.role} @ ${app_.company}`;
  try {
    const docRes = await fetch("https://docs.googleapis.com/v1/documents", {
      method: "POST",
      headers: { "Authorization": `Bearer ${salaryDocToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: docTitle })
    });
    if (!docRes.ok) return c.json({ error: "Google Docs API fehlgeschlagen" }, 502);
    const doc = await docRes.json() as { documentId: string };
    await fetch(`https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${salaryDocToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: content } }] })
    });
    if (app_.googleFolderId) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${doc.documentId}?addParents=${app_.googleFolderId}&removeParents=root&fields=id`, {
        method: "PATCH", headers: { "Authorization": `Bearer ${salaryDocToken}` }
      });
    }
    const docUrl = `https://docs.google.com/document/d/${doc.documentId}/edit`;
    return c.json({ docUrl });
  } catch (err) {
    console.error("salary-check export-doc error:", err);
    return c.json({ error: "Google Doc Erstellung fehlgeschlagen" }, 502);
  }
});

// ATS-Keywords extrahieren (Inbox stage)
app.post("/api/applications/:id/ai/ats-keywords", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { ai } = await c.req.json<{ ai: AiConfig }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const system = `Du bist ein Recruiting-Experte. Extrahiere die wichtigsten Keywords für ATS-Systeme aus der Stellenbeschreibung. Antworte NUR mit JSON:
{ "mustHave": ["<string>"], "niceToHave": ["<string>"], "softSkills": ["<string>"], "tools": ["<string>"] }`;
  const user = `Stellenbeschreibung:\n${app_.description?.slice(0, 2500) ?? ""}`;
  try {
    const raw = await callAi(system, user, ai);
    const parsed = extractJson(raw) as { mustHave: string[]; niceToHave: string[]; softSkills: string[]; tools: string[] };
    await persistAiResult(id, "ats-keywords", parsed as Record<string, unknown>);
    return c.json(parsed);
  } catch (err) {
    console.error("ats-keywords error:", err);
    return c.json({ error: "KI-Anfrage fehlgeschlagen" }, 502);
  }
});

// Unternehmens- & Branchenrecherche (Pending stage)
app.post("/api/applications/:id/ai/company-research", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { ai } = await c.req.json<{ ai: AiConfig }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const system = `Du bist ein Business-Analyst. Erstelle eine strukturierte Unternehmens- und Branchenrecherche basierend auf den verfügbaren Informationen. Antworte NUR mit JSON:
{ "unternehmensueberblick": "<string>", "branche": "<string>", "marktposition": "<string>", "unternehmenskultur": "<string>", "wettbewerber": ["<string>"], "aktuelleThemen": ["<string>"], "gespraechsthemen": ["<string>"] }`;
  const user = `Unternehmen: ${app_.company}\nRolle: ${app_.role}\nStellenbeschreibung:\n${app_.description?.slice(0, 2000) ?? ""}`;
  try {
    const raw = await callAi(system, user, ai);
    const parsed = extractJson(raw) as { unternehmensueberblick: string; branche: string; marktposition: string; unternehmenskultur: string; wettbewerber: string[]; aktuelleThemen: string[]; gespraechsthemen: string[] };
    await persistAiResult(id, "company-research", parsed as Record<string, unknown>);
    return c.json(parsed);
  } catch (err) {
    console.error("company-research error:", err);
    return c.json({ error: "KI-Anfrage fehlgeschlagen" }, 502);
  }
});

// Export Company Research to Google Doc
app.post("/api/applications/:id/ai/company-research/export-doc", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { research } = await c.req.json<{ research: { unternehmensueberblick: string; branche: string; marktposition: string; unternehmenskultur: string; wettbewerber: string[]; aktuelleThemen: string[]; gespraechsthemen: string[] } }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const compResToken = await getDriveAccessToken(userId);
  if (!compResToken) return c.json({ error: "Google Drive nicht verbunden" }, 400);
  const date = new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  const sep = "─".repeat(40);
  let content = `Unternehmensrecherche: ${app_.company} – ${app_.role}\n${date}\n\n`;
  content += `${sep}\nUNTERNEHMENSÜBERBLICK\n${sep}\n\n${research.unternehmensueberblick}\n\n`;
  content += `Branche: ${research.branche}\n\n`;
  content += `${sep}\nMARKTPOSITION\n${sep}\n\n${research.marktposition}\n\n`;
  content += `${sep}\nUNTERNEHMENSKULTUR\n${sep}\n\n${research.unternehmenskultur}\n\n`;
  if (research.wettbewerber.length > 0) {
    content += `${sep}\nWETTBEWERBER\n${sep}\n\n${research.wettbewerber.map(w => `• ${w}`).join("\n")}\n\n`;
  }
  if (research.aktuelleThemen.length > 0) {
    content += `${sep}\nAKTUELLE THEMEN\n${sep}\n\n${research.aktuelleThemen.map(t => `• ${t}`).join("\n")}\n\n`;
  }
  if (research.gespraechsthemen.length > 0) {
    content += `${sep}\nGESPRÄCHSTHEMEN FÜRS INTERVIEW\n${sep}\n\n${research.gespraechsthemen.map(t => `💡 ${t}`).join("\n")}`;
  }
  const docTitle = `Unternehmensrecherche – ${app_.company}`;
  try {
    const docRes = await fetch("https://docs.googleapis.com/v1/documents", {
      method: "POST",
      headers: { "Authorization": `Bearer ${compResToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: docTitle })
    });
    if (!docRes.ok) return c.json({ error: "Google Docs API fehlgeschlagen" }, 502);
    const doc = await docRes.json() as { documentId: string };
    await fetch(`https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${compResToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: content } }] })
    });
    if (app_.googleFolderId) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${doc.documentId}?addParents=${app_.googleFolderId}&removeParents=root&fields=id`, {
        method: "PATCH", headers: { "Authorization": `Bearer ${compResToken}` }
      });
    }
    const docUrl = `https://docs.google.com/document/d/${doc.documentId}/edit`;
    return c.json({ docUrl });
  } catch (err) {
    console.error("company-research export-doc error:", err);
    return c.json({ error: "Google Doc Erstellung fehlgeschlagen" }, 502);
  }
});

// Ackermann-Verhandlungs-Script (Pending stage)
app.post("/api/applications/:id/ai/ackermann-script", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { ai } = await c.req.json<{ ai: AiConfig }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const [profile] = await db.select().from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  const system = `Du bist ein Experte für Gehaltsverhandlung nach dem Ackermann-Modell (FBI-Verhandlungsmethode, Chris Voss). Erstelle ein konkretes, mehrstufiges Verhandlungs-Script. Das Ackermann-Modell: Startgebot = 65% des Zielgehalts, dann Angebote bei 85%, 95%, 100% mit abnehmenden Steigerungen und einer ungeraden Endzahl. Antworte NUR mit JSON:
{ "zielgehalt": number, "ankergebot": number, "schritte": [{ "runde": number, "angebot": number, "formulierung": "<string>", "taktik": "<string>" }], "nichtmonetaer": ["<string>"], "vossAnker": "<string>" }`;
  const user = `Rolle: ${app_.role}\nUnternehmen: ${app_.company}\nLohnband (falls bekannt): ${app_.salary ?? "nicht angegeben"}\nStellenbeschreibung:\n${app_.description?.slice(0, 1500) ?? ""}\nProfil des Kandidaten: ${profile?.masterCv?.slice(0, 1000) ?? "Kein Profil hinterlegt"}`;
  try {
    const raw = await callAi(system, user, ai);
    const parsed = extractJson(raw) as { zielgehalt: number; ankergebot: number; schritte: Array<{ runde: number; angebot: number; formulierung: string; taktik: string }>; nichtmonetaer: string[]; vossAnker: string };
    await persistAiResult(id, "ackermann-script", parsed as Record<string, unknown>);
    return c.json(parsed);
  } catch (err) {
    console.error("ackermann-script error:", err);
    return c.json({ error: "KI-Anfrage fehlgeschlagen" }, 502);
  }
});

// Export Ackermann Script to Google Doc
app.post("/api/applications/:id/ai/ackermann-script/export-doc", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { script } = await c.req.json<{ script: { zielgehalt: number; ankergebot: number; schritte: Array<{ runde: number; angebot: number; formulierung: string; taktik: string }>; nichtmonetaer: string[]; vossAnker: string } }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const ackerToken = await getDriveAccessToken(userId);
  if (!ackerToken) return c.json({ error: "Google Drive nicht verbunden" }, 400);
  const date = new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  const sep = "═".repeat(48);
  let content = `Ackermann-Verhandlungs-Script: ${app_.role} @ ${app_.company}\n${date}\n\n`;
  content += `${sep}\nZIELGEHALT & ANKERLOHN\n${sep}\n\n`;
  content += `Zielgehalt:   CHF ${script.zielgehalt.toLocaleString("de-CH")}\n`;
  content += `Ankergebot:   CHF ${script.ankergebot.toLocaleString("de-CH")} (65% des Zielgehalts)\n\n`;
  content += `${sep}\nVERHANDLUNGSSCHRITTE\n${sep}\n\n`;
  content += script.schritte.map(s =>
    `Runde ${s.runde} — CHF ${s.angebot.toLocaleString("de-CH")}\nFormulierung: "${s.formulierung}"\nTaktik: ${s.taktik}`
  ).join("\n\n") + "\n\n";
  content += `${sep}\nCHRIS VOSS ANKER-FORMULIERUNG\n${sep}\n\n${script.vossAnker}\n\n`;
  if (script.nichtmonetaer.length > 0) {
    content += `${sep}\nNICHT-MONETÄRE ALTERNATIVEN\n${sep}\n\n`;
    content += script.nichtmonetaer.map(n => `• ${n}`).join("\n");
  }
  const docTitle = `Ackermann-Script – ${app_.role} @ ${app_.company}`;
  try {
    const docRes = await fetch("https://docs.googleapis.com/v1/documents", {
      method: "POST",
      headers: { "Authorization": `Bearer ${ackerToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: docTitle })
    });
    if (!docRes.ok) return c.json({ error: "Google Docs API fehlgeschlagen" }, 502);
    const doc = await docRes.json() as { documentId: string };
    await fetch(`https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${ackerToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: content } }] })
    });
    if (app_.googleFolderId) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${doc.documentId}?addParents=${app_.googleFolderId}&removeParents=root&fields=id`, {
        method: "PATCH", headers: { "Authorization": `Bearer ${ackerToken}` }
      });
    }
    const docUrl = `https://docs.google.com/document/d/${doc.documentId}/edit`;
    return c.json({ docUrl });
  } catch (err) {
    console.error("ackermann-script export-doc error:", err);
    return c.json({ error: "Google Doc Erstellung fehlgeschlagen" }, 502);
  }
});

// Anschreiben reviewen (Letter stage)
app.post("/api/applications/:id/ai/letter-review", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { ai, coverLetterContent } = await c.req.json<{ ai: AiConfig; coverLetterContent?: string }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const system = `Du bist ein erfahrener Karriere-Coach. Analysiere das Anschreiben kritisch. Antworte NUR mit JSON:
{ "gesamteindruck": "<string>", "staerken": ["<string>"], "verbesserungen": ["<string>"], "cliches": ["<string>"], "tonalitaet": "<string>", "laenge": "zu lang | angemessen | zu kurz", "personalisierung": "schwach | mittel | stark" }`;
  const letterText = coverLetterContent?.trim() || "Kein Anschreiben vorhanden. Bitte zuerst ein Anschreiben generieren oder einfügen.";
  const user = `Stelle: ${app_.role} bei ${app_.company}\nStellenbeschreibung:\n${app_.description?.slice(0, 1000) ?? ""}\n\nAnschreiben:\n${letterText}`;
  try {
    const raw = await callAi(system, user, ai);
    const parsed = extractJson(raw) as { gesamteindruck: string; staerken: string[]; verbesserungen: string[]; cliches: string[]; tonalitaet: string; laenge: string; personalisierung: string };
    await persistAiResult(id, "letter-review", parsed as Record<string, unknown>);
    return c.json(parsed);
  } catch (err) {
    console.error("letter-review error:", err);
    return c.json({ error: "KI-Anfrage fehlgeschlagen" }, 502);
  }
});

// Eröffnungssätze (Letter stage)
app.post("/api/applications/:id/ai/opening-sentences", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { ai } = await c.req.json<{ ai: AiConfig }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const [profile] = await db.select().from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  const system = `Du bist ein Kreativtexter für Bewerbungsunterlagen. Generiere 3 verschiedene, aufmerksamkeitsstarke Eröffnungssätze für ein Anschreiben — keine generischen 'Hiermit bewerbe ich mich...' Sätze. Jeder soll einen anderen Ansatz haben (z.B. Ergebnis-orientiert, Neugier-weckend, Persönlich-verbindend). Antworte NUR mit JSON:
{ "saetze": [{ "satz": "<string>", "ansatz": "<string>", "erklaerung": "<string>" }] }`;
  const user = `Stelle: ${app_.role} bei ${app_.company}\nMein Profil: ${profile?.masterCv?.slice(0, 1500) ?? "Kein Profil hinterlegt"}\nStellenbeschreibung:\n${app_.description?.slice(0, 1000) ?? ""}`;
  try {
    const raw = await callAi(system, user, ai);
    const parsed = extractJson(raw) as { saetze: Array<{ satz: string; ansatz: string; erklaerung: string }> };
    await persistAiResult(id, "opening-sentences", parsed as Record<string, unknown>);
    return c.json(parsed);
  } catch (err) {
    console.error("opening-sentences error:", err);
    return c.json({ error: "KI-Anfrage fehlgeschlagen" }, 502);
  }
});

// Onboarding-Checkliste (Accepted stage)
app.post("/api/applications/:id/ai/onboarding", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { ai } = await c.req.json<{ ai: AiConfig }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const system = `Du bist ein Karriere-Coach. Erstelle eine strukturierte Onboarding-Checkliste für die ersten 90 Tage in der neuen Stelle. Antworte NUR mit JSON:
{ "erste30Tage": ["<string>"], "erste60Tage": ["<string>"], "erste90Tage": ["<string>"], "allgemein": ["<string>"] }`;
  const user = `Stelle: ${app_.role}\nUnternehmen: ${app_.company}\nBranche: aus Stellenbeschreibung ableiten\nStellenbeschreibung:\n${app_.description?.slice(0, 1500) ?? ""}`;
  try {
    const raw = await callAi(system, user, ai);
    const parsed = extractJson(raw) as { erste30Tage: string[]; erste60Tage: string[]; erste90Tage: string[]; allgemein: string[] };
    await persistAiResult(id, "onboarding", parsed as Record<string, unknown>);
    return c.json(parsed);
  } catch (err) {
    console.error("onboarding error:", err);
    return c.json({ error: "KI-Anfrage fehlgeschlagen" }, 502);
  }
});

// Export Onboarding Checklist to Google Doc
app.post("/api/applications/:id/ai/onboarding/export-doc", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { checklist } = await c.req.json<{ checklist: { erste30Tage: string[]; erste60Tage: string[]; erste90Tage: string[]; allgemein: string[] } }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  const onboardToken = await getDriveAccessToken(userId);
  if (!onboardToken) return c.json({ error: "Google Drive nicht verbunden" }, 400);
  const date = new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  const sep = "─".repeat(40);
  let content = `Onboarding-Checkliste: ${app_.role} @ ${app_.company}\n${date}\n\n`;
  content += `${sep}\nERSTE 30 TAGE\n${sep}\n\n`;
  content += checklist.erste30Tage.map(t => `☐ ${t}`).join("\n") + "\n\n";
  content += `${sep}\nERSTE 60 TAGE\n${sep}\n\n`;
  content += checklist.erste60Tage.map(t => `☐ ${t}`).join("\n") + "\n\n";
  content += `${sep}\nERSTE 90 TAGE\n${sep}\n\n`;
  content += checklist.erste90Tage.map(t => `☐ ${t}`).join("\n") + "\n\n";
  if (checklist.allgemein.length > 0) {
    content += `${sep}\nALLGEMEIN\n${sep}\n\n`;
    content += checklist.allgemein.map(t => `• ${t}`).join("\n");
  }
  const docTitle = `Onboarding-Checkliste – ${app_.role} @ ${app_.company}`;
  try {
    const docRes = await fetch("https://docs.googleapis.com/v1/documents", {
      method: "POST",
      headers: { "Authorization": `Bearer ${onboardToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: docTitle })
    });
    if (!docRes.ok) return c.json({ error: "Google Docs API fehlgeschlagen" }, 502);
    const doc = await docRes.json() as { documentId: string };
    await fetch(`https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${onboardToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: content } }] })
    });
    if (app_.googleFolderId) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${doc.documentId}?addParents=${app_.googleFolderId}&removeParents=root&fields=id`, {
        method: "PATCH", headers: { "Authorization": `Bearer ${onboardToken}` }
      });
    }
    const docUrl = `https://docs.google.com/document/d/${doc.documentId}/edit`;
    return c.json({ docUrl });
  } catch (err) {
    console.error("onboarding export-doc error:", err);
    return c.json({ error: "Google Doc Erstellung fehlgeschlagen" }, 502);
  }
});

// ─────────────────────────────────────────────────────────────────
// Google OAuth
// ─────────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const GOOGLE_REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost/api/google/callback";
const GOOGLE_FRONTEND_URL  = process.env.GOOGLE_FRONTEND_URL ?? "http://localhost";
// Scopes include openid+email so Google Sign-In + Drive work in one consent
const GOOGLE_SCOPES = (process.env.GOOGLE_SCOPES ?? "") ||
  "openid email profile https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/calendar.readonly";

app.get("/api/google/auth-url", (c) => {
  if (!GOOGLE_CLIENT_ID) return c.json({ error: "Google credentials not configured" }, 503);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return c.json({ url: url.toString() });
});

app.get("/api/google/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.redirect(`${GOOGLE_FRONTEND_URL}/?google_error=no_code`);
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI, grant_type: "authorization_code"
      })
    });
    const data = await res.json() as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string };
    if (!data.access_token) return c.redirect(`${GOOGLE_FRONTEND_URL}/?google_error=token_failed`);

    // Decode Google email from id_token for login
    let googleEmail: string | null = null;
    if (data.id_token) {
      try {
        const payload = JSON.parse(Buffer.from(data.id_token.split(".")[1], "base64").toString());
        googleEmail = payload.email ?? null;
      } catch { /* ignore */ }
    }

    // Store Google Drive tokens (linked to user if known)
    const [existingUser] = googleEmail
      ? await db.select().from(users).where(eq(users.email, googleEmail.toLowerCase())).limit(1)
      : [];

    // Get current user from JWT if available (for non-Google-Sign-In OAuth flows)
    const authToken = getCookie(c, "access_token");
    let currentUserId: string | null = null;
    if (authToken) {
      try {
        currentUserId = (jwt.verify(authToken, getJwtSecret()) as { userId: string }).userId;
      } catch { /* ignore */ }
    }

    const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
    await db.delete(googleOAuthTokens).where(
      currentUserId
        ? eq(googleOAuthTokens.userId, currentUserId)
        : isNull(googleOAuthTokens.userId)
    );
    await db.insert(googleOAuthTokens).values({
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt,
      scope: data.scope ?? GOOGLE_SCOPES,
      userId: currentUserId ?? existingUser?.id ?? null
    });

    // If this is a Google Sign-In (we have their email), log them in or create account
    if (googleEmail) {
      const [appUser] = existingUser
        ? [existingUser]
        : await db.insert(users).values({ email: googleEmail.toLowerCase() }).returning();
      issueTokens(c, appUser.id, false, await getSessionTimeout(appUser.id));
      return c.redirect(`${GOOGLE_FRONTEND_URL}/?google_connected=1`);
    }

    return c.redirect(`${GOOGLE_FRONTEND_URL}/settings?google_connected=1`);
  } catch (err) {
    console.error("Google callback error:", err);
    return c.redirect(`${GOOGLE_FRONTEND_URL}/?google_error=exception`);
  }
});

app.get("/api/google/status", async (c) => {
  const userId = getUserId(c);
  const tokens = await db.select().from(googleOAuthTokens)
    .where(or(eq(googleOAuthTokens.userId, userId), isNull(googleOAuthTokens.userId)))
    .limit(1);
  if (tokens.length === 0) return c.json({ connected: false });
  const token = tokens[0];
  // Connected as long as we have a refresh token (can always renew) OR a non-expired access token
  const hasRefreshToken = !!token.refreshToken;
  const expired = token.expiresAt ? new Date(token.expiresAt) < new Date() : false;
  return c.json({ connected: hasRefreshToken || !expired, expiresAt: token.expiresAt });
});

app.post("/api/google/docs/create", async (c) => {
  const { title } = await c.req.json<{ title: string }>();
  const accessToken = await getDriveAccessToken(getUserId(c));
  if (!accessToken) return c.json({ error: "Not connected to Google" }, 401);
  const docRes = await fetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title })
  });
  if (!docRes.ok) {
    const err = await docRes.text();
    return c.json({ error: "Google Docs API error", details: err }, 502);
  }
  const doc = await docRes.json() as { documentId: string; title: string };
  const docUrl = `https://docs.google.com/document/d/${doc.documentId}/edit`;
  return c.json({ docId: doc.documentId, docUrl, title: doc.title });
});

app.delete("/api/google/disconnect", async (c) => {
  const userId = getUserId(c);
  await db.delete(googleOAuthTokens).where(eq(googleOAuthTokens.userId, userId));
  return c.json({ ok: true });
});

// ─── Google Drive Folder Structure ───────────────────────────
/** Replace {placeholders} in a naming rule with actual values */
function applyNameRule(rule: string, vars: Record<string, string>): string {
  return rule.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? k);
}

async function getDriveAccessToken(userId?: string): Promise<string | null> {
  let token;
  if (userId) {
    // Try user-specific token first
    const [userToken] = await db.select().from(googleOAuthTokens)
      .where(eq(googleOAuthTokens.userId, userId)).limit(1);
    token = userToken;
  }
  // Fallback to shared token (user_id IS NULL, set by admin)
  if (!token) {
    const [shared] = await db.select().from(googleOAuthTokens)
      .where(isNull(googleOAuthTokens.userId)).limit(1);
    token = shared;
  }
  if (!token) return null;

  // Auto-refresh if expired or expiring within 5 minutes
  const needsRefresh = token.expiresAt
    ? new Date(token.expiresAt).getTime() - Date.now() < 5 * 60 * 1000
    : false;

  if (needsRefresh && token.refreshToken) {
    try {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: token.refreshToken,
          grant_type: "refresh_token",
        }),
      });
      const data = await res.json() as { access_token?: string; expires_in?: number; error?: string };
      if (data.access_token) {
        const expiresAt = data.expires_in
          ? new Date(Date.now() + data.expires_in * 1000)
          : new Date(Date.now() + 3600 * 1000);
        await db.update(googleOAuthTokens).set({ accessToken: data.access_token, expiresAt })
          .where(eq(googleOAuthTokens.id, token.id));
        return data.access_token;
      }
    } catch { /* fall through — return existing token and let caller handle 401 */ }
  }

  return token.accessToken;
}

// Create/get Drive folder for an application
app.post("/api/applications/:id/drive/init-folder", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json<{ folderRule?: string; parentFolderId?: string }>().catch(() => ({ folderRule: undefined, parentFolderId: undefined }));
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);

  // Idempotent: return existing folder
  if (app_.googleFolderId) {
    return c.json({ folderId: app_.googleFolderId, folderUrl: app_.googleFolderUrl });
  }

  const accessToken = await getDriveAccessToken(userId);
  if (!accessToken) return c.json({ error: "Google Drive nicht verbunden" }, 400);

  // Build folder name from rule
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const vars = {
    firma:  app_.company ?? "Firma",
    rolle:  app_.role ?? "Stelle",
    datum:  `${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
    jahr:   String(now.getFullYear()),
    monat:  pad(now.getMonth() + 1),
    name:   "", // profile name added below
    doc:    ""
  };
  const [profile] = await db.select({ name: userProfile.name }).from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  vars.name = profile?.name ?? "";

  const rule = body.folderRule || "{firma} – {rolle} – {datum}";
  const folderName = applyNameRule(rule, vars);

  // Create folder in Drive
  const body2: Record<string, unknown> = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder"
  };
  const parentId = body.parentFolderId || env.GOOGLE_APPLICATIONS_FOLDER_ID;
  if (parentId) {
    body2.parents = [parentId];
  }

  const res = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body2)
  });
  if (!res.ok) {
    const err = await res.json() as { error?: { message?: string } };
    return c.json({ error: `Drive API: ${err.error?.message ?? res.status}` }, 502);
  }
  const folder = await res.json() as { id: string };
  const folderId = folder.id;
  const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;

  await db.update(applications).set({ googleFolderId: folderId, googleFolderUrl: folderUrl, updatedAt: new Date() }).where(eq(applications.id, id));

  return c.json({ folderId, folderUrl, name: folderName });
});

// List template files from master folder
// Mime types allowed as templates (excludes folders, JSON, etc.)
const TEMPLATE_MIME_ALLOWLIST = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

// Validate a Drive folder ID and return its name
// List all files in an application's Drive folder (live from Drive, not DB)
app.get("/api/applications/:id/drive/files", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const [app_] = await db.select({ googleFolderId: applications.googleFolderId })
    .from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_?.googleFolderId) return c.json({ error: "Kein Drive-Ordner für diese Bewerbung" }, 400);
  const accessToken = await getDriveAccessToken(userId);
  if (!accessToken) return c.json({ error: "Google Drive nicht verbunden" }, 400);
  const files = await listDriveFiles(accessToken, app_.googleFolderId);
  // Return only non-folder files
  return c.json(files.filter(f => f.mimeType !== "application/vnd.google-apps.folder"));
});

// Delete a file from Drive AND optionally from applicationDocuments
app.delete("/api/applications/:id/drive/files/:fileId", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const fileId = c.req.param("fileId");
  const accessToken = await getDriveAccessToken(userId);
  if (!accessToken) return c.json({ error: "Google Drive nicht verbunden" }, 400);
  // Delete from Drive
  const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  if (!delRes.ok && delRes.status !== 404) {
    return c.json({ error: `Drive delete: HTTP ${delRes.status}` }, 502);
  }
  // Remove from applicationDocuments if there's a matching googleDocId
  await db.delete(applicationDocuments)
    .where(and(eq(applicationDocuments.applicationId, id), eq(applicationDocuments.googleDocId, fileId)));
  return c.json({ ok: true });
});

// Upload a PDF from a URL directly into the application's Drive folder
app.post("/api/applications/:id/drive/upload-pdf-from-url", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const accessToken = await getDriveAccessToken(userId);
  if (!accessToken) return c.json({ error: "Google Drive nicht verbunden" }, 400);

  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Bewerbung nicht gefunden" }, 404);
  if (!app_.googleFolderId) return c.json({ error: "Kein Drive-Ordner für diese Bewerbung" }, 400);

  const { url, fileName } = await c.req.json<{ url: string; fileName: string }>();
  if (!url) return c.json({ error: "Keine URL angegeben" }, 400);

  // Fetch the PDF — Google Drive URLs need auth-download via Drive API
  let fileBuffer: ArrayBuffer;
  try {
    const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
      const fileId = driveMatch[1];
      const fetchRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { "Authorization": `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(60_000)
      });
      if (!fetchRes.ok) return c.json({ error: `Drive Download: HTTP ${fetchRes.status}` }, 502);
      fileBuffer = await fetchRes.arrayBuffer();
    } else {
      const fetchRes = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!fetchRes.ok) return c.json({ error: `Datei nicht erreichbar: HTTP ${fetchRes.status}` }, 502);
      fileBuffer = await fetchRes.arrayBuffer();
    }
  } catch {
    return c.json({ error: "Datei-URL nicht erreichbar" }, 502);
  }

  const safeName = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  const boundary = "----AppPdfUploadBoundary";
  const metadata = JSON.stringify({ name: safeName, mimeType: "application/pdf", parents: [app_.googleFolderId] });
  const multipartBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
    Buffer.from(fileBuffer),
    Buffer.from(`\r\n--${boundary}--`)
  ]);

  const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body: multipartBody
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.json() as { error?: { message?: string } };
    return c.json({ error: `Drive Upload: ${err.error?.message ?? uploadRes.status}` }, 502);
  }

  const uploaded = await uploadRes.json() as { id: string; name: string };
  return c.json({ ok: true, fileId: uploaded.id, fileUrl: `https://drive.google.com/file/d/${uploaded.id}/view`, fileName: uploaded.name });
});

app.get("/api/drive/folder-info", async (c) => {
  const folderId = c.req.query("folderId");
  if (!folderId) return c.json({ error: "folderId required" }, 400);
  const accessToken = await getDriveAccessToken(getUserId(c));
  if (!accessToken) return c.json({ error: "Google Drive nicht verbunden" }, 400);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType`, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  if (!res.ok) return c.json({ error: "Ordner nicht gefunden oder kein Zugriff" }, 404);
  const f = await res.json() as { id: string; name: string; mimeType: string };
  if (f.mimeType !== "application/vnd.google-apps.folder") return c.json({ error: "Das ist kein Ordner" }, 400);
  return c.json({ id: f.id, name: f.name, url: `https://drive.google.com/drive/folders/${f.id}` });
});

type DriveFile = { id: string; name: string; mimeType: string; webViewLink: string; capabilities?: { canCopy?: boolean } };

async function listDriveFiles(accessToken: string, folderId: string): Promise<DriveFile[]> {
  const query = encodeURIComponent(
    `'${folderId}' in parents and trashed = false ` +
    `and mimeType != 'application/json'`
  );
  const fields = encodeURIComponent("files(id,name,mimeType,webViewLink,capabilities/canCopy)");
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=name&pageSize=50`, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  if (!res.ok) return [];
  const data = await res.json() as { files?: DriveFile[] };
  return data.files ?? [];
}

app.get("/api/drive/templates", async (c) => {
  const masterFolderId = env.GOOGLE_MASTER_FOLDER_ID;
  if (!masterFolderId) return c.json({ error: "GOOGLE_MASTER_FOLDER_ID nicht konfiguriert" }, 400);
  const accessToken = await getDriveAccessToken(getUserId(c));
  if (!accessToken) return c.json({ error: "Google Drive nicht verbunden" }, 400);

  const allFiles = await listDriveFiles(accessToken, masterFolderId);
  const docFiles = allFiles.filter(f => TEMPLATE_MIME_ALLOWLIST.has(f.mimeType));
  const subfolders = allFiles.filter(f => f.mimeType === "application/vnd.google-apps.folder");

  // If no direct doc files, look one level into subfolders
  if (docFiles.length === 0 && subfolders.length > 0) {
    const nested = await Promise.all(
      subfolders.map(sf => listDriveFiles(accessToken, sf.id))
    );
    const nestedDocs = nested.flat().filter(f => TEMPLATE_MIME_ALLOWLIST.has(f.mimeType));
    return c.json(nestedDocs);
  }

  // Also include docs from subfolders alongside direct docs
  if (subfolders.length > 0) {
    const nested = await Promise.all(
      subfolders.map(sf => listDriveFiles(accessToken, sf.id))
    );
    const nestedDocs = nested.flat().filter(f => TEMPLATE_MIME_ALLOWLIST.has(f.mimeType));
    const combined = [...docFiles, ...nestedDocs];
    // Deduplicate by ID
    return c.json(combined.filter((f, i, arr) => arr.findIndex(x => x.id === f.id) === i));
  }

  return c.json(docFiles);
});

// Copy a template file into an application's Drive folder
app.post("/api/applications/:id/drive/copy-template", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { templateFileId, docRule } = await c.req.json<{ templateFileId: string; docRule?: string }>();
  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Nicht gefunden" }, 404);
  if (!app_.googleFolderId) return c.json({ error: "Bitte zuerst einen Drive-Ordner erstellen" }, 400);

  const accessToken = await getDriveAccessToken(userId);
  if (!accessToken) return c.json({ error: "Google Drive nicht verbunden" }, 400);

  // Get original file name for the rule
  const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${templateFileId}?fields=name,mimeType`, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  if (!metaRes.ok) return c.json({ error: "Vorlage nicht gefunden" }, 404);
  const meta = await metaRes.json() as { name: string; mimeType: string };

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const [profile] = await db.select({ name: userProfile.name }).from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  const vars = {
    doc:    meta.name,
    firma:  app_.company ?? "Firma",
    rolle:  app_.role ?? "Stelle",
    name:   profile?.name ?? "",
    datum:  `${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
    jahr:   String(now.getFullYear()),
    monat:  pad(now.getMonth() + 1),
  };
  const rule = docRule || "{doc} – {name} – {firma} – {datum}";
  const newName = applyNameRule(rule, vars);

  // Try copy via Drive API
  let copied: { id: string; mimeType: string } | null = null;
  const copyRes = await fetch(`https://www.googleapis.com/drive/v3/files/${templateFileId}/copy`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: newName, parents: [app_.googleFolderId] })
  });

  if (!copyRes.ok) {
    // Fallback for copy-restricted Google Docs: export as docx → upload as new Google Doc
    if (meta.mimeType === "application/vnd.google-apps.document") {
      try {
        const exportRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${templateFileId}/export?mimeType=application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
          { headers: { "Authorization": `Bearer ${accessToken}` } }
        );
        if (exportRes.ok) {
          const docxBuffer = await exportRes.arrayBuffer();
          // Re-upload as Google Doc (Drive will convert .docx → Google Doc preserving most formatting)
          const boundary = "----UploadBoundary";
          const metadata = JSON.stringify({ name: newName, mimeType: "application/vnd.google-apps.document", parents: [app_.googleFolderId] });
          const multipartBody = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`),
            Buffer.from(docxBuffer),
            Buffer.from(`\r\n--${boundary}--`)
          ]);
          const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
            body: multipartBody
          });
          if (uploadRes.ok) {
            copied = await uploadRes.json() as { id: string; mimeType: string };
          }
        }
      } catch { /* fall through to original error */ }
    }
    if (!copied) {
      const err = await copyRes.json() as { error?: { message?: string } };
      return c.json({ error: `Kopieren fehlgeschlagen: ${err.error?.message ?? copyRes.status}. Tipp: Öffne das Original-Dokument in Google Drive → Mehr Optionen → Berechtigungen → Kopieren erlauben.` }, 502);
    }
  } else {
    copied = await copyRes.json() as { id: string; mimeType: string };
  }
  const isDoc = copied.mimeType === "application/vnd.google-apps.document";
  const fileUrl = isDoc
    ? `https://docs.google.com/document/d/${copied.id}/edit`
    : `https://drive.google.com/file/d/${copied.id}/view`;

  // Detect document type from name
  const nameLower = meta.name.toLowerCase();
  const docType = nameLower.includes("letter") || nameLower.includes("anschreiben") || nameLower.includes("motivat")
    ? "letter"
    : nameLower.includes("cv") || nameLower.includes("lebenslauf") || nameLower.includes("resume")
    ? "cv"
    : "other";

  // Store in applicationDocuments
  const [saved] = await db.insert(applicationDocuments).values({
    applicationId: id,
    type: docType,
    name: newName,
    googleDocId: copied.id,
    googleDocUrl: fileUrl,
    status: "draft"
  }).returning();

  return c.json({ fileId: copied.id, fileUrl, docId: saved.id, name: newName });
});

// ─────────────────────────────────────────────────────────────────
// Export / Import
// ─────────────────────────────────────────────────────────────────
async function buildExportPayload(userId: string) {
  const appIds = (await db.select({ id: applications.id }).from(applications).where(eq(applications.userId, userId))).map(a => a.id);
  const [apps, docs, activities, contacts, profiles, userDocs] = await Promise.all([
    db.select().from(applications).where(eq(applications.userId, userId)).orderBy(applications.createdAt),
    appIds.length > 0
      ? db.select().from(applicationDocuments).where(inArray(applicationDocuments.applicationId, appIds)).orderBy(applicationDocuments.createdAt)
      : Promise.resolve([]),
    appIds.length > 0
      ? db.select().from(applicationActivities).where(inArray(applicationActivities.applicationId, appIds)).orderBy(applicationActivities.createdAt)
      : Promise.resolve([]),
    appIds.length > 0
      ? db.select().from(applicationContacts).where(inArray(applicationContacts.applicationId, appIds)).orderBy(applicationContacts.createdAt)
      : Promise.resolve([]),
    db.select().from(userProfile).where(eq(userProfile.userId, userId)).limit(1),
    db.select().from(userDocuments).where(eq(userDocuments.userId, userId)).orderBy(userDocuments.createdAt),
  ]);
  return {
    meta: { version: 1, exportedAt: new Date().toISOString(), app: "application-pal" },
    applications: apps,
    applicationDocuments: docs,
    applicationActivities: activities,
    applicationContacts: contacts,
    userProfile: profiles[0] ?? null,
    userDocuments: userDocs,
  };
}

// Find or create a named folder inside a parent (or root if no parent)
async function findOrCreateDriveFolder(accessToken: string, name: string, parentId?: string): Promise<string> {
  const parentQuery = parentId ? ` and '${parentId}' in parents` : " and 'root' in parents";
  const q = encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentQuery}`);
  const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  if (listRes.ok) {
    const data = await listRes.json() as { files?: { id: string }[] };
    if (data.files?.[0]?.id) return data.files[0].id;
  }
  // Not found → create
  const body: Record<string, unknown> = { name, mimeType: "application/vnd.google-apps.folder" };
  if (parentId) body.parents = [parentId];
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!createRes.ok) throw new Error(`Could not create Drive folder "${name}"`);
  const folder = await createRes.json() as { id: string };
  return folder.id;
}

// Upload a PDF from an existing URL to Google Drive "Application-PDF" folder
app.post("/api/drive/upload-pdf-from-url", async (c) => {
  const accessToken = await getDriveAccessToken(getUserId(c));
  if (!accessToken) return c.json({ error: "Google Drive nicht verbunden" }, 400);

  const { url, fileName, parentFolderId } = await c.req.json<{ url: string; fileName: string; parentFolderId?: string }>();
  if (!url) return c.json({ error: "Keine URL angegeben" }, 400);

  // Fetch the PDF — Google Drive URLs need auth-download via Drive API
  let fileBuffer: ArrayBuffer;
  try {
    // Detect Google Drive file IDs from view/share URLs
    const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
      // Use Drive API to download with auth token
      const fileId = driveMatch[1];
      const fetchRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { "Authorization": `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(60_000)
      });
      if (!fetchRes.ok) return c.json({ error: `Drive Download: HTTP ${fetchRes.status}` }, 502);
      fileBuffer = await fetchRes.arrayBuffer();
    } else {
      // Regular URL — fetch directly
      const fetchRes = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!fetchRes.ok) return c.json({ error: `Datei konnte nicht geladen werden: HTTP ${fetchRes.status}` }, 502);
      fileBuffer = await fetchRes.arrayBuffer();
    }
  } catch {
    return c.json({ error: "Datei-URL nicht erreichbar" }, 502);
  }

  const parent = parentFolderId || env.GOOGLE_APPLICATIONS_FOLDER_ID || undefined;
  const pdfFolderId = await findOrCreateDriveFolder(accessToken, "Application-PDF", parent);
  const safeName = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;

  const boundary = "----PdfUrlUploadBoundary";
  const metadata = JSON.stringify({ name: safeName, mimeType: "application/pdf", parents: [pdfFolderId] });
  const multipartBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
    Buffer.from(fileBuffer),
    Buffer.from(`\r\n--${boundary}--`)
  ]);

  const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body: multipartBody
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.json() as { error?: { message?: string } };
    return c.json({ error: `Drive Upload: ${err.error?.message ?? uploadRes.status}` }, 502);
  }

  const uploaded = await uploadRes.json() as { id: string; name: string };
  return c.json({ ok: true, fileId: uploaded.id, fileUrl: `https://drive.google.com/file/d/${uploaded.id}/view`, fileName: uploaded.name });
});

// Upload a PDF file to Google Drive "Application-PDF" folder
app.post("/api/drive/upload-pdf", async (c) => {
  const accessToken = await getDriveAccessToken(getUserId(c));
  if (!accessToken) return c.json({ error: "Google Drive nicht verbunden" }, 400);

  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  const parentFolderId = (formData.get("parentFolderId") as string | null) || env.GOOGLE_APPLICATIONS_FOLDER_ID || undefined;

  if (!file) return c.json({ error: "Keine Datei übermittelt" }, 400);
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return c.json({ error: "Nur PDF-Dateien werden unterstützt" }, 400);
  }

  try {
    // Find or create "Application-PDF" folder
    const pdfFolderId = await findOrCreateDriveFolder(accessToken, "Application-PDF", parentFolderId);

    // Multipart upload
    const boundary = "----PdfUploadBoundary";
    const metadata = JSON.stringify({ name: file.name, mimeType: "application/pdf", parents: [pdfFolderId] });
    const fileBuffer = await file.arrayBuffer();
    const multipartBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
      Buffer.from(fileBuffer),
      Buffer.from(`\r\n--${boundary}--`)
    ]);

    const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body: multipartBody
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.json() as { error?: { message?: string } };
      return c.json({ error: `Drive Upload: ${err.error?.message ?? uploadRes.status}` }, 502);
    }

    const uploaded = await uploadRes.json() as { id: string; name: string };
    const fileUrl = `https://drive.google.com/file/d/${uploaded.id}/view`;
    return c.json({ ok: true, fileId: uploaded.id, fileUrl, fileName: uploaded.name });
  } catch (err) {
    console.error("PDF upload error:", err);
    return c.json({ error: "PDF-Upload fehlgeschlagen" }, 502);
  }
});

// Copy a user-library document (by userDocumentId) into the application's Drive folder
app.post("/api/applications/:id/drive/copy-doc", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const { userDocumentId, docRule } = await c.req.json<{ userDocumentId: string; docRule?: string }>();

  const [app_] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app_) return c.json({ error: "Bewerbung nicht gefunden" }, 404);
  if (!app_.googleFolderId) return c.json({ error: "Kein Drive-Ordner für diese Bewerbung" }, 400);

  const [libDoc] = await db.select().from(userDocuments).where(and(eq(userDocuments.id, userDocumentId), eq(userDocuments.userId, userId))).limit(1);
  if (!libDoc) return c.json({ error: "Dokument nicht gefunden" }, 404);
  if (!libDoc.url) return c.json({ error: "Dokument hat keine URL" }, 400);

  // Only Google Docs can be copied via Drive API
  if (libDoc.fileType !== "gdoc") {
    return c.json({ error: "Nur Google Docs können in Drive kopiert werden" }, 400);
  }

  // Extract Google Doc file ID from URL
  const docIdMatch = libDoc.url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!docIdMatch) return c.json({ error: "Ungültige Google Docs URL" }, 400);
  const fileId = docIdMatch[1];

  const accessToken = await getDriveAccessToken(userId);
  if (!accessToken) return c.json({ error: "Google Drive nicht verbunden" }, 400);

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const [profile] = await db.select({ name: userProfile.name }).from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  const vars = {
    doc:    libDoc.name,
    firma:  app_.company ?? "Firma",
    rolle:  app_.role ?? "Stelle",
    name:   profile?.name ?? "",
    datum:  `${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
    jahr:   String(now.getFullYear()),
    monat:  pad(now.getMonth() + 1),
  };
  const rule = docRule || "{doc} – {name} – {firma} – {datum}";
  const newName = applyNameRule(rule, vars);

  // Try direct copy first
  let newFileId: string | null = null;
  const copyRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: newName, parents: [app_.googleFolderId] })
  });

  if (copyRes.ok) {
    const copied = await copyRes.json() as { id: string };
    newFileId = copied.id;
  } else {
    // Fallback: export as docx → upload
    const exportRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
      { headers: { "Authorization": `Bearer ${accessToken}` } }
    );
    if (exportRes.ok) {
      const docxBuffer = await exportRes.arrayBuffer();
      const boundary = "----DocCopyBoundary";
      const metadata = JSON.stringify({ name: newName, mimeType: "application/vnd.google-apps.document", parents: [app_.googleFolderId] });
      const multipartBody = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`),
        Buffer.from(docxBuffer),
        Buffer.from(`\r\n--${boundary}--`)
      ]);
      const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
        body: multipartBody
      });
      if (uploadRes.ok) {
        const uploaded = await uploadRes.json() as { id: string };
        newFileId = uploaded.id;
      }
    }
  }

  if (!newFileId) return c.json({ error: "Kopieren fehlgeschlagen. Prüfe Kopierberechtigung im Originaldokument." }, 502);
  const driveUrl = `https://docs.google.com/document/d/${newFileId}/edit`;
  return c.json({ ok: true, fileId: newFileId, driveUrl, name: newName });
});

app.get("/api/export", async (c) => {
  const payload = await buildExportPayload(getUserId(c));
  const date = new Date().toISOString().slice(0, 10);
  c.header("Content-Disposition", `attachment; filename="application-pal-export-${date}.json"`);
  c.header("Content-Type", "application/json");
  return c.body(JSON.stringify(payload, null, 2));
});

// Save export to Google Drive
app.post("/api/export/drive", async (c) => {
  const userId = getUserId(c);
  const accessToken = await getDriveAccessToken(userId);
  if (!accessToken) return c.json({ error: "Google Drive nicht verbunden" }, 400);

  const payload = await buildExportPayload(userId);
  const date     = new Date().toISOString().slice(0, 10);
  const fileName = `application-pal-backup-${date}.json`;
  const content  = JSON.stringify(payload, null, 2);

  // Multipart upload to Drive
  const boundary = "----ExportBoundary";
  const metadata = JSON.stringify({ name: fileName, mimeType: "application/json" });
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadata,
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    content,
    `--${boundary}--`
  ].join("\r\n");

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body
  });

  if (!res.ok) {
    const err = await res.json() as { error?: { message?: string } };
    return c.json({ error: `Drive Upload: ${err.error?.message ?? res.status}` }, 502);
  }
  const file = await res.json() as { id: string; name: string };
  return c.json({ ok: true, fileId: file.id, fileName, fileUrl: `https://drive.google.com/file/d/${file.id}/view` });
});

app.post("/api/import", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json<{
    mode?: "replace" | "merge";
    data: {
      meta: { app: string; version: number };
      applications?: Record<string, unknown>[];
      applicationDocuments?: Record<string, unknown>[];
      applicationActivities?: Record<string, unknown>[];
      applicationContacts?: Record<string, unknown>[];
      userProfile?: Record<string, unknown> | null;
      userDocuments?: Record<string, unknown>[];
    };
  }>();

  const { mode = "replace", data } = body;

  if (data?.meta?.app !== "application-pal" || data?.meta?.version !== 1) {
    return c.json({ error: "Ungültige Export-Datei" }, 400);
  }

  if (mode === "replace") {
    // Delete only this user's data in FK-safe order
    const userAppIds = (await db.select({ id: applications.id }).from(applications).where(eq(applications.userId, userId))).map(a => a.id);
    if (userAppIds.length > 0) {
      await db.delete(applicationActivities).where(inArray(applicationActivities.applicationId, userAppIds));
      await db.delete(applicationContacts).where(inArray(applicationContacts.applicationId, userAppIds));
      await db.delete(applicationDocuments).where(inArray(applicationDocuments.applicationId, userAppIds));
    }
    await db.delete(applications).where(eq(applications.userId, userId));
    await db.delete(userDocuments).where(eq(userDocuments.userId, userId));
    await db.delete(userProfile).where(eq(userProfile.userId, userId));
  }

  // Insert all records — add userId, skip duplicates on conflict (for merge mode)
  if (data.applications?.length) {
    for (const row of data.applications) {
      const r = Object.assign({}, row, { userId }) as never;
      await db.insert(applications).values(r).onConflictDoUpdate({ target: applications.id, set: r });
    }
  }
  if (data.applicationDocuments?.length) {
    for (const row of data.applicationDocuments) {
      await db.insert(applicationDocuments).values(row as never).onConflictDoUpdate({
        target: applicationDocuments.id,
        set: row as never,
      });
    }
  }
  if (data.applicationActivities?.length) {
    for (const row of data.applicationActivities) {
      await db.insert(applicationActivities).values(row as never).onConflictDoUpdate({
        target: applicationActivities.id,
        set: row as never,
      });
    }
  }
  if (data.applicationContacts?.length) {
    for (const row of data.applicationContacts) {
      await db.insert(applicationContacts).values(row as never).onConflictDoUpdate({
        target: applicationContacts.id,
        set: row as never,
      });
    }
  }
  if (data.userDocuments?.length) {
    for (const row of data.userDocuments) {
      const r = Object.assign({}, row, { userId }) as never;
      await db.insert(userDocuments).values(r).onConflictDoUpdate({ target: userDocuments.id, set: r });
    }
  }
  if (data.userProfile) {
    const rp = Object.assign({}, data.userProfile, { userId }) as never;
    await db.insert(userProfile).values(rp).onConflictDoUpdate({ target: userProfile.id, set: rp });
  }

  return c.json({ ok: true, mode, imported: {
    applications: data.applications?.length ?? 0,
    documents: data.applicationDocuments?.length ?? 0,
    activities: data.applicationActivities?.length ?? 0,
    contacts: data.applicationContacts?.length ?? 0,
    userDocuments: data.userDocuments?.length ?? 0,
    userProfile: data.userProfile ? 1 : 0,
  }});
});

void ensureKbTree()
  .then(regenerateKbIndex)
  .catch((error) => console.warn("Knowledge base bootstrap failed:", error));

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
    // In Docker muss der Server auf allen Interfaces lauschen (Nginx im Compose-Netz).
    hostname: "0.0.0.0"
  },
  (info) => {
    console.log(`backend listening on http://localhost:${info.port}`);
  }
);

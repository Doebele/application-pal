import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  applicationImportRequestSchema,
  applicationInsertSchema,
  applicationPatchSchema,
  applicationDocumentInsertSchema,
  applicationDocumentPatchSchema,
  applicationActivityInsertSchema,
  applicationContactInsertSchema,
  applicationContactPatchSchema,
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
  applicationStageEnum,
  stubDocumentResponseSchema,
  type AiConfig
} from "@application-pal/shared";
import { desc, eq } from "drizzle-orm";
import { ZodError } from "zod";
import { db } from "./db.js";
import { env } from "./env.js";

const app = new Hono();

const roleKeywords = [
  "entwickler",
  "developer",
  "software engineer",
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
- tags: 4-6 skills from the requirements, e.g. ["Figma","UX/UI","Wireframing","Agile"]
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

async function extractWithLmStudio(text: string, ai: AiConfig): Promise<LlmExtracted | null> {
  const baseUrl = (ai.lmStudioUrl ?? "http://localhost:1234").replace(/\/$/, "");
  const model = ai.lmStudioModel || undefined;

  const body = {
    model,
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      { role: "user",   content: EXTRACTION_PROMPT_USER_PREFIX + text.slice(0, 6000) }
    ],
    temperature: 0.05,
    max_tokens: 4096  // Qwen3 needs space for its <think> block before JSON output
  };

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000)
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
      max_tokens: 300,
      system: EXTRACTION_PROMPT,
      messages: [{ role: "user", content: EXTRACTION_PROMPT_USER_PREFIX + text.slice(0, 6000) }]
    }),
    signal: AbortSignal.timeout(120_000)
  });

  if (!res.ok) {
    console.warn("Anthropic extraction failed:", res.status, await res.text());
    return null;
  }

  const json = await res.json() as { content?: { type: string; text: string }[] };
  const raw = json.content?.find((b) => b.type === "text")?.text ?? "";
  return parseJsonResponse(raw);
}

function parseJsonResponse(raw: string): LlmExtracted | null {
  try {
    // strip Qwen3 thinking block <think>...</think>
    let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    // strip markdown fences
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    // extract first JSON object if there's extra text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      company:     parsed.company     ?? null,
      role:        parsed.role        ?? null,
      location:    parsed.location    ?? null,
      salary:      parsed.salary      ?? null,
      tags:        Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6) : [],
      description: parsed.description ?? ""
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
  const rows = await db.select().from(applications).orderBy(desc(applications.updatedAt));
  return c.json(rows);
});

app.post("/api/applications", zValidator("json", applicationInsertSchema), async (c) => {
  const payload = c.req.valid("json");
  const stage = payload.stage ?? "import_validating";
  const shouldSetAppliedAt = stageTriggersAppliedAt.has(stage) && !payload.appliedAt;
  const [created] = await db
    .insert(applications)
    .values({
      ...payload,
      stage,
      appliedAt: shouldSetAppliedAt ? new Date() : payload.appliedAt
    })
    .returning();

  return c.json(created, 201);
});

app.patch("/api/applications/:id", zValidator("json", applicationPatchSchema), async (c) => {
  const id = c.req.param("id");
  const payload = c.req.valid("json");
  const stage = payload.stage;
  const shouldSetAppliedAt =
    stage !== undefined && stageTriggersAppliedAt.has(stage) && !payload.appliedAt;

  const existing = await db.select().from(applications).where(eq(applications.id, id)).limit(1);
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
  }

  return c.json(updated);
});

app.delete("/api/applications/:id", async (c) => {
  const id = c.req.param("id");
  const [deleted] = await db.delete(applications).where(eq(applications.id, id)).returning();
  if (!deleted) {
    return c.json({ error: "Application not found" }, 404);
  }

  return c.json({ ok: true });
});

// Derive a logo URL from the job posting URL domain using Clearbit
function logoUrlFromJobUrl(jobUrl: string | undefined): string | null {
  if (!jobUrl) return null;
  try {
    const { hostname } = new URL(jobUrl);
    // Strip leading "www." and use root domain
    const domain = hostname.replace(/^www\./, "");
    return `https://logo.clearbit.com/${domain}`;
  } catch {
    return null;
  }
}

app.post("/api/applications/import", zValidator("json", applicationImportRequestSchema), async (c) => {
  const payload = c.req.valid("json");
  let text = payload.text ?? "";

  // Derive logo from the job URL domain (Clearbit)
  const logoUrl = logoUrlFromJobUrl(payload.url ?? undefined);

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

  // Try LLM extraction if AI config provided
  if (payload.ai && payload.ai.provider !== "none") {
    try {
      const llm = await extractWithAi(normalized, payload.ai);
      if (llm) {
        return c.json({
          company:     llm.company,
          role:        llm.role,
          location:    llm.location,
          description: llm.description || normalized.slice(0, 500),
          salary:      llm.salary,
          tags:        llm.tags.length > 0 ? JSON.stringify(llm.tags) : null,
          source:      null,
          logoUrl,
        });
      }
    } catch (error) {
      console.warn("LLM extraction failed, falling back to regex:", error);
    }
  }

  // Regex fallback
  return c.json({
    company:     pickCompany(normalized),
    role:        pickRole(normalized),
    location:    pickLocation(normalized),
    description: normalized.slice(0, 1000),
    salary:      null,
    tags:        null,
    source:      null,
    logoUrl,
  });
});

// Proxy LM Studio model list to avoid CORS issues from the browser
app.get("/api/lm-studio/models", async (c) => {
  const baseUrl = (c.req.query("url") ?? "http://localhost:1234").replace(/\/$/, "");
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
  const rows = await db.select().from(userProfile).limit(1);
  if (rows.length === 0) return c.json(null, 404);
  return c.json(rows[0]);
});

app.put("/api/profile", zValidator("json", userProfileInsertSchema), async (c) => {
  const payload = c.req.valid("json");
  const existing = await db.select().from(userProfile).limit(1);
  if (existing.length === 0) {
    const [created] = await db.insert(userProfile).values({ ...payload }).returning();
    return c.json(created, 201);
  }
  const [updated] = await db.update(userProfile)
    .set({ ...payload, updatedAt: new Date() })
    .where(eq(userProfile.id, existing[0].id))
    .returning();
  return c.json(updated);
});

// ─────────────────────────────────────────────────────────────────
// User Documents (global document vault)
// ─────────────────────────────────────────────────────────────────
app.get("/api/documents", async (c) => {
  const rows = await db.select().from(userDocuments).orderBy(desc(userDocuments.createdAt));
  return c.json(rows);
});

app.post("/api/documents", zValidator("json", userDocumentInsertSchema), async (c) => {
  const payload = c.req.valid("json");
  const [doc] = await db.insert(userDocuments).values(payload).returning();
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

// ─────────────────────────────────────────────────────────────────
// Google OAuth
// ─────────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const GOOGLE_REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost/api/google/callback";
const GOOGLE_FRONTEND_URL  = process.env.GOOGLE_FRONTEND_URL ?? "http://localhost";
const GOOGLE_SCOPES        = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents";

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
  if (!code) return c.redirect(`${GOOGLE_FRONTEND_URL}/settings?google_error=no_code`);
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI, grant_type: "authorization_code"
      })
    });
    const data = await res.json() as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
    if (!data.access_token) return c.redirect(`${GOOGLE_FRONTEND_URL}/?google_error=token_failed`);
    const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
    await db.delete(googleOAuthTokens);
    await db.insert(googleOAuthTokens).values({
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt,
      scope: data.scope ?? GOOGLE_SCOPES
    });
    return c.redirect(`${GOOGLE_FRONTEND_URL}/settings?google_connected=1`);
  } catch {
    return c.redirect(`${GOOGLE_FRONTEND_URL}/settings?google_error=exception`);
  }
});

app.get("/api/google/status", async (c) => {
  const tokens = await db.select().from(googleOAuthTokens).limit(1);
  if (tokens.length === 0) return c.json({ connected: false });
  const token = tokens[0];
  const expired = token.expiresAt ? new Date(token.expiresAt) < new Date() : false;
  return c.json({ connected: !expired, expiresAt: token.expiresAt });
});

app.post("/api/google/docs/create", async (c) => {
  const { title } = await c.req.json<{ title: string }>();
  const tokens = await db.select().from(googleOAuthTokens).limit(1);
  if (tokens.length === 0) return c.json({ error: "Not connected to Google" }, 401);
  const accessToken = tokens[0].accessToken;
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
  await db.delete(googleOAuthTokens);
  return c.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────
// Export / Import
// ─────────────────────────────────────────────────────────────────
app.get("/api/export", async (c) => {
  const [apps, docs, activities, contacts, profiles, userDocs] = await Promise.all([
    db.select().from(applications).orderBy(applications.createdAt),
    db.select().from(applicationDocuments).orderBy(applicationDocuments.createdAt),
    db.select().from(applicationActivities).orderBy(applicationActivities.createdAt),
    db.select().from(applicationContacts).orderBy(applicationContacts.createdAt),
    db.select().from(userProfile).limit(1),
    db.select().from(userDocuments).orderBy(userDocuments.createdAt),
  ]);

  const payload = {
    meta: { version: 1, exportedAt: new Date().toISOString(), app: "application-pal" },
    applications: apps,
    applicationDocuments: docs,
    applicationActivities: activities,
    applicationContacts: contacts,
    userProfile: profiles[0] ?? null,
    userDocuments: userDocs,
  };

  const date = new Date().toISOString().slice(0, 10);
  c.header("Content-Disposition", `attachment; filename="application-pal-export-${date}.json"`);
  c.header("Content-Type", "application/json");
  return c.body(JSON.stringify(payload, null, 2));
});

app.post("/api/import", async (c) => {
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
    // Delete in FK-safe order
    await db.delete(applicationActivities);
    await db.delete(applicationContacts);
    await db.delete(applicationDocuments);
    await db.delete(applications);
    await db.delete(userDocuments);
    await db.delete(userProfile);
  }

  // Insert all records — skip duplicates on conflict (for merge mode)
  if (data.applications?.length) {
    for (const row of data.applications) {
      await db.insert(applications).values(row as never).onConflictDoUpdate({
        target: applications.id,
        set: row as never,
      });
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
      await db.insert(userDocuments).values(row as never).onConflictDoUpdate({
        target: userDocuments.id,
        set: row as never,
      });
    }
  }
  if (data.userProfile) {
    await db.insert(userProfile).values(data.userProfile as never).onConflictDoUpdate({
      target: userProfile.id,
      set: data.userProfile as never,
    });
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

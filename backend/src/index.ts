import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
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
  type AiConfig
} from "@application-pal/shared";
import { PDFParse } from "pdf-parse";
import { and, desc, eq, ilike, inArray, ne, or, isNull, type SQL } from "drizzle-orm";
import { ZodError } from "zod";
import { db } from "./db.js";
import { env } from "./env.js";

const app = new Hono();

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
      max_tokens: 900,
      system: KB_EXTRACTION_PROMPT,
      messages: [{ role: "user", content: `Extract from this source:\n\n${cleanJobText(text).slice(0, 8000)}` }]
    }),
    signal: AbortSignal.timeout(120_000)
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

    const [company] = extracted.company
      ? await db.insert(kbCompanies).values(extracted.company).returning()
      : [null];
    const [role] = extracted.role
      ? await db.insert(kbRoles).values({ ...extracted.role, companyId: company?.id ?? null }).returning()
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
    await db.update(kbSources).set({ status: "done", errorMessage: null }).where(eq(kbSources.id, source.id));

    return { companyId: company?.id ?? null, roleId: role?.id ?? null, sourceId: source.id };
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
  const showArchived = c.req.query("archived") === "true";
  const rows = await db.select().from(applications)
    .where(showArchived
      ? eq(applications.archived, "true")
      : or(isNull(applications.archived), ne(applications.archived, "true"))
    )
    .orderBy(desc(applications.updatedAt));
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

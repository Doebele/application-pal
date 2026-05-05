import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  applicationImportRequestSchema,
  applicationPatchSchema,
  applications,
  applicationStageEnum,
  stubDocumentResponseSchema
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
  /\b(?:in|standort|location)\s*:?\s*([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\s-]{2,40})/i;
const companyPattern =
  /\b(?:firma|unternehmen|company|arbeitgeber)\s*:?\s*([A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9&.,\s-]{2,60})/i;

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
  if (matched?.[1]) {
    return matched[1].trim();
  }

  const firstNamedEntity = text.match(/\b([A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9&.-]{2,}(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9&.-]{2,}){0,3})\b/);
  return firstNamedEntity?.[1]?.trim() ?? null;
};

const pickLocation = (text: string): string | null => text.match(locationPattern)?.[1]?.trim() ?? null;

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

app.post("/api/applications", zValidator("json", applicationPatchSchema.required()), async (c) => {
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

  const [updated] = await db
    .update(applications)
    .set({
      ...payload,
      appliedAt: shouldSetAppliedAt ? new Date() : payload.appliedAt,
      updatedAt: new Date()
    })
    .where(eq(applications.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "Application not found" }, 404);
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

  return c.json({
    company: pickCompany(normalized),
    role: pickRole(normalized),
    location: pickLocation(normalized),
    description: normalized
  });
});

app.get("/api/applications/:id/cv", (c) => c.json(stubDocumentResponseSchema.parse({ content: null })));
app.get("/api/applications/:id/letter", (c) =>
  c.json(stubDocumentResponseSchema.parse({ content: null }))
);

serve(
  {
    fetch: app.fetch,
    port: env.PORT
  },
  (info) => {
    console.log(`backend listening on http://localhost:${info.port}`);
  }
);

import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const applicationStageEnum = pgEnum("application_stage", [
  "import_validating",
  "preparing_cv",
  "preparing_letter",
  "application_sent",
  "pending",
  "interview_1",
  "interview_2",
  "rejected",
  "accepted"
]);

export const applications = pgTable("applications", {
  id: uuid("id").defaultRandom().primaryKey(),
  company: text("company").notNull(),
  role: text("role").notNull(),
  location: text("location"),
  url: text("url"),
  description: text("description"),
  notes: text("notes"),
  stage: applicationStageEnum("stage").notNull().default("import_validating"),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const applicationSelectSchema = createSelectSchema(applications);
export const applicationInsertSchema = createInsertSchema(applications, {
  company: z.string().trim().min(1),
  role: z.string().trim().min(1)
});

export const applicationPatchSchema = applicationInsertSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true
  })
  .partial();

export const applicationImportRequestSchema = z
  .object({
    url: z.string().trim().url().optional(),
    text: z.string().trim().min(1).optional()
  })
  .refine((value) => Boolean(value.url || value.text), {
    message: "Either url or text must be provided."
  });

export const applicationImportResponseSchema = z.object({
  company: z.string().nullable(),
  role: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string()
});

export const stubDocumentResponseSchema = z.object({
  content: z.string().nullable()
});

export type ApplicationStage = (typeof applicationStageEnum.enumValues)[number];
export type Application = z.infer<typeof applicationSelectSchema>;
export type CreateApplicationInput = z.infer<typeof applicationInsertSchema>;
export type PatchApplicationInput = z.infer<typeof applicationPatchSchema>;
export type ImportApplicationInput = z.infer<typeof applicationImportRequestSchema>;

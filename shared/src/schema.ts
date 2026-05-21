import { boolean, bigint, integer, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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

export const kbSourceKindEnum = pgEnum("kb_source_kind", ["url", "pdf"]);
export const kbSourceStatusEnum = pgEnum("kb_source_status", ["pending", "done", "error"]);
export const kbInsightEntityTypeEnum = pgEnum("kb_insight_entity_type", ["company", "role"]);

// ─── Knowledge Base ────────────────────────────────────────────
export const kbCompanies = pgTable("kb_companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug"),
  name: text("name").notNull(),
  website: text("website"),
  industry: text("industry"),
  size: text("size"),
  headquarters: text("headquarters"),
  cultureNotes: text("culture_notes"),
  agentFilePath: text("agent_file_path"),
  extractedAt: timestamp("extracted_at", { withTimezone: true }).notNull().defaultNow()
});

export const kbRoles = pgTable("kb_roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug"),
  companyId: uuid("company_id").references(() => kbCompanies.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  seniority: text("seniority"),
  requirements: text("requirements").array(),
  salaryRange: text("salary_range"),
  agentFilePath: text("agent_file_path"),
  extractedAt: timestamp("extracted_at", { withTimezone: true }).notNull().defaultNow()
});

export const kbSources = pgTable("kb_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  urlOrPath: text("url_or_path").notNull(),
  kind: kbSourceKindEnum("kind").notNull(),
  status: kbSourceStatusEnum("status").notNull().default("pending"),
  rawText: text("raw_text"),
  errorMessage: text("error_message"),
  agentFilePath: text("agent_file_path"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const kbInsights = pgTable("kb_insights", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceId: uuid("source_id").references(() => kbSources.id, { onDelete: "cascade" }),
  entityType: kbInsightEntityTypeEnum("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull().default("0.50"),
  notes: text("notes")
});

export const applications = pgTable("applications", {
  id: uuid("id").defaultRandom().primaryKey(),
  company: text("company").notNull(),
  role: text("role").notNull(),
  location: text("location"),
  url: text("url"),
  description: text("description"),
  notes: text("notes"),
  stage: applicationStageEnum("stage").notNull().default("import_validating"),
  priority: text("priority"),
  source: text("source"),
  salary: text("salary"),
  tags: text("tags"),
  nextDeadline: text("next_deadline"),
  portalUrl: text("portal_url"),   // Bewerbungsportal URL (separate from job posting url)
  logoUrl: text("logo_url"),
  kbRoleId: uuid("kb_role_id").references(() => kbRoles.id, { onDelete: "set null" }),
  archived: text("archived").default("false"),
  archiveReason: text("archive_reason"),  // 'unavailable' | 'irrelevant' | 'taken' | 'other' | free text
  matchScore: integer("match_score"),
  matchDetails: text("match_details"),   // JSON: {breakdown, staerken, luecken, reasoning}
  googleFolderId: text("google_folder_id"),
  googleFolderUrl: text("google_folder_url"),
  interview1Details: text("interview1_details"),  // JSON: InterviewDetails
  interview2Details: text("interview2_details"),  // JSON: InterviewDetails
  interview1Prep: text("interview1_prep"),         // JSON: InterviewPrep (AI-generated questions)
  interview2Prep: text("interview2_prep"),         // JSON: InterviewPrep (AI-generated questions)
  glassdoorData: text("glassdoor_data"),           // JSON: GlassdoorData (rating, links, AI estimate)
  kununuData: text("kununu_data"),                 // JSON: KununuData (rating, url)
  linkedinData: text("linkedin_data"),             // JSON: LinkedinData (url, description)
  aiResultsCache: text("ai_results_cache"),        // JSON: {[actionId]: {data, _savedAt}}
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  userId: uuid("user_id"),                          // FK → users.id (multi-user isolation)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

// ─── User Profile ─────────────────────────────────────────────
export const userProfile = pgTable("user_profile", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email"),
  phone: text("phone"),
  location: text("location"),
  headline: text("headline"),
  linkedinUrl: text("linkedin_url"),
  linkedinBio: text("linkedin_bio"),
  photoUrl: text("photo_url"),
  masterCv: text("master_cv"),
  personalNotes: text("personal_notes"),
  desiredSalary: text("desired_salary"),
  googleCalendarId: text("google_calendar_id"),
  driveApplicationsFolderId: text("drive_applications_folder_id"), // per-user Drive folder
  docTemplates: text("doc_templates"),                             // JSON: DocTemplateConfig per content type
  persona: text("persona"),                                        // 'schulabgaenger' | 'berufseinsteiger' | 'berufsumsteiger'
  sessionTimeout: text("session_timeout").default("15m"),
  userId: uuid("user_id"),                          // FK → users.id (multi-user isolation)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

// ─── Application Documents ────────────────────────────────────
export const applicationDocuments = pgTable("application_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  applicationId: uuid("application_id").notNull(),
  type: text("type").notNull(),       // 'cv' | 'letter' | 'other'
  name: text("name").notNull(),
  status: text("status").default("draft"), // 'draft' | 'in_progress' | 'final' | 'sent'
  googleDocId: text("google_doc_id"),
  googleDocUrl: text("google_doc_url"),
  fileUrl: text("file_url"),
  userDocumentId: text("user_document_id"),   // reference to user_documents.id when linked from library
  version: integer("version").default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

// ─── Application Activities ───────────────────────────────────
export const applicationActivities = pgTable("application_activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  applicationId: uuid("application_id").notNull(),
  type: text("type").notNull(), // 'note' | 'email' | 'call' | 'interview' | 'deadline' | 'stage_change' | 'document'
  title: text("title").notNull(),
  description: text("description"),
  activityDate: timestamp("activity_date", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

// ─── Application Contacts ─────────────────────────────────────
export const applicationContacts = pgTable("application_contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  applicationId: uuid("application_id").notNull(),
  name: text("name").notNull(),
  role: text("role"),   // 'recruiter' | 'hiring_manager' | 'other'
  email: text("email"),
  linkedinUrl: text("linkedin_url"),
  phone: text("phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

// ─── Google OAuth Tokens ──────────────────────────────────────
export const googleOAuthTokens = pgTable("google_oauth_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  scope: text("scope"),
  userId: uuid("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

// ─── Auth: Users ───────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

// ─── Auth: WebAuthn / Passkey Credentials ─────────────────────
export const webauthnCredentials = pgTable("webauthn_credentials", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  counter: bigint("counter", { mode: "number" }).notNull().default(0),
  deviceName: text("device_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

// ─── Auth: Password Reset OTP ─────────────────────────────────
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

// ─── Schemas & Types ──────────────────────────────────────────
export const kbCompanySelectSchema = createSelectSchema(kbCompanies);
export const kbCompanyInsertSchema = createInsertSchema(kbCompanies, {
  name: z.string().trim().min(1)
}).omit({ id: true, extractedAt: true });

export const kbRoleSelectSchema = createSelectSchema(kbRoles);
export const kbRoleInsertSchema = createInsertSchema(kbRoles, {
  title: z.string().trim().min(1)
}).omit({ id: true, extractedAt: true });

export const kbSourceSelectSchema = createSelectSchema(kbSources);
export const kbSourceInsertSchema = createInsertSchema(kbSources, {
  urlOrPath: z.string().trim().min(1),
  kind: z.enum(["url", "pdf"]),
  status: z.enum(["pending", "done", "error"]).default("pending")
}).omit({ id: true, createdAt: true });

export const kbInsightSelectSchema = createSelectSchema(kbInsights);
export const kbInsightInsertSchema = createInsertSchema(kbInsights, {
  entityType: z.enum(["company", "role"])
}).omit({ id: true });

export const applicationSelectSchema = createSelectSchema(applications);
export const applicationInsertSchema = createInsertSchema(applications, {
  company: z.string().trim().min(1),
  role: z.string().trim().min(1)
});

export const applicationPatchSchema = applicationInsertSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial();

export const userProfileSelectSchema = createSelectSchema(userProfile);
export const userProfileInsertSchema = createInsertSchema(userProfile).omit({ id: true, createdAt: true, updatedAt: true }).partial();

export const applicationDocumentSelectSchema = createSelectSchema(applicationDocuments);
export const applicationDocumentInsertSchema = createInsertSchema(applicationDocuments, {
  applicationId: z.string().uuid(),
  type: z.enum(["cv", "letter", "other"]),
  name: z.string().trim().min(1)
}).omit({ id: true, createdAt: true, updatedAt: true });
export const applicationDocumentPatchSchema = applicationDocumentInsertSchema.partial();

export const applicationActivitySelectSchema = createSelectSchema(applicationActivities);
export const applicationActivityInsertSchema = createInsertSchema(applicationActivities, {
  applicationId: z.string().uuid(),
  type: z.enum(["note", "email", "call", "interview", "deadline", "stage_change", "document"]),
  title: z.string().trim().min(1)
}).omit({ id: true, createdAt: true });

export const applicationContactSelectSchema = createSelectSchema(applicationContacts);
export const applicationContactInsertSchema = createInsertSchema(applicationContacts, {
  name: z.string().trim().min(1)
}).omit({ id: true, createdAt: true, applicationId: true });
export const applicationContactPatchSchema = applicationContactInsertSchema.partial();

// ─── Application Tasks (stage-specific checklists) ───────────
export const applicationTasks = pgTable("application_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  applicationId: uuid("application_id").notNull(),
  stage: text("stage").notNull(),
  title: text("title").notNull(),
  done: boolean("done").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  userId: uuid("user_id"),                          // FK → users.id (multi-user isolation)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const applicationTaskSelectSchema = createSelectSchema(applicationTasks);
export const applicationTaskInsertSchema = createInsertSchema(applicationTasks, {
  title: z.string().trim().min(1)
}).omit({ id: true, createdAt: true, applicationId: true });
export const applicationTaskPatchSchema = applicationTaskInsertSchema.partial();
export type ApplicationTask = z.infer<typeof applicationTaskSelectSchema>;

// ─── User Documents (global document vault) ───────────────────
export const userDocuments = pgTable("user_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default("sonstiges"),
  fileType: text("file_type").notNull().default("link"),
  url: text("url"),
  description: text("description"),
  tags: text("tags"),
  userId: uuid("user_id"),                          // FK → users.id (multi-user isolation)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

// ─── Invites ──────────────────────────────────────────────────
export const invites = pgTable("invites", {
  id: uuid("id").defaultRandom().primaryKey(),
  token: text("token").notNull().unique(),
  email: text("email"),               // optional: restrict to specific email
  used: boolean("used").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdBy: uuid("created_by"),      // FK → users.id
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const userDocumentSelectSchema = createSelectSchema(userDocuments);
export const userDocumentInsertSchema = createInsertSchema(userDocuments, {
  name: z.string().trim().min(1),
  category: z.enum(["lebenslauf", "motivationsschreiben", "zeugnis", "referenz", "zertifikat", "figma", "portfolio", "sonstiges"]).default("sonstiges"),
  fileType: z.enum(["pdf", "link", "figma", "image", "gdoc"]).default("link"),
}).omit({ id: true, createdAt: true, updatedAt: true, userId: true });
export const userDocumentPatchSchema = userDocumentInsertSchema.partial();
export type UserDocument = z.infer<typeof userDocumentSelectSchema>;

export const aiConfigSchema = z.object({
  provider: z.enum(["none", "lm-studio", "anthropic"]).default("none"),
  anthropicApiKey: z.string().optional(),
  lmStudioUrl: z.string().optional(),
  lmStudioModel: z.string().optional()
});

export const kbIngestUrlRequestSchema = z.object({
  url: z.string().trim().url(),
  ai: aiConfigSchema.optional()
});

export const applicationImportRequestSchema = z
  .object({
    url: z.string().trim().url().optional(),
    text: z.string().trim().min(1).optional(),
    ai: aiConfigSchema.optional()
  })
  .refine((value) => Boolean(value.url || value.text), {
    message: "Either url or text must be provided."
  });

export type AiConfig = z.infer<typeof aiConfigSchema>;

export const applicationImportResponseSchema = z.object({
  company: z.string().nullable(),
  role: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string(),
  salary: z.string().nullable().optional(),
  tags: z.string().nullable().optional(),
  source: z.string().nullable().optional()
});

export const stubDocumentResponseSchema = z.object({
  content: z.string().nullable()
});

export type ApplicationStage = (typeof applicationStageEnum.enumValues)[number];
export type KbCompany = z.infer<typeof kbCompanySelectSchema>;
export type KbRole = z.infer<typeof kbRoleSelectSchema>;
export type KbSource = z.infer<typeof kbSourceSelectSchema>;
export type KbInsight = z.infer<typeof kbInsightSelectSchema>;
export type Application = z.infer<typeof applicationSelectSchema>;
export type UserProfile = z.infer<typeof userProfileSelectSchema>;
export type ApplicationDocument = z.infer<typeof applicationDocumentSelectSchema>;
export type ApplicationActivity = z.infer<typeof applicationActivitySelectSchema>;
export type ApplicationContact = z.infer<typeof applicationContactSelectSchema>;
export type CreateApplicationInput = z.infer<typeof applicationInsertSchema>;
export type PatchApplicationInput = z.infer<typeof applicationPatchSchema>;
export type ImportApplicationInput = z.infer<typeof applicationImportRequestSchema>;
export type KbIngestUrlInput = z.infer<typeof kbIngestUrlRequestSchema>;
export type User = { id: string; email: string; createdAt: Date };
export type WebauthnCredential = { id: string; userId: string; credentialId: string; publicKey: string; counter: number; deviceName: string | null; createdAt: Date };

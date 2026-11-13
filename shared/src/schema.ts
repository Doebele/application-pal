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
  contactPerson: text("contact_person"),   // named contact / recruiter, extracted from the posting
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
  jobType: text("job_type"),          // pensum: '100%' | '80–100%' | '80%' | '60–80%' | '60%' | '50%' | '40%' | custom
  workModel: text("work_model"),      // 'onsite' | 'hybrid' | 'remote'
  contractType: text("contract_type"), // 'Unbefristet' | '6 Monate' | '9 Monate' | '12 Monate' | free text
  language: text("language"),         // 'de' | 'en' — application language (default 'de')
  ravApplicationType: text("rav_application_type"), // RAV proof: 'online' | 'recruiter' | 'meeting_confirmed' | 'meeting_unconfirmed' — null = derive
  ravProof: text("rav_proof"),                     // RAV proof: 'email' | 'linkedin' | 'other' — null = derive
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
  ravSheetId: text("rav_sheet_id"),                                 // per-user RAV proof spreadsheet (target of the RAV export)
  cvMasterLang: text("cv_master_lang"),                             // CV-Check: master language the other CV languages are translated from ("de"|"en"|"fr", null = en)
  cvCheckWaivers: text("cv_check_waivers"),                         // CV-Check: JSON { de?: string[], en?: string[], fr?: string[] } — points the user accepted as-is (count as passed)
  linkedinState: text("linkedin_state"),                           // LinkedIn-Check: JSON LinkedInState (journey, goal, selfReport, waivers, checklist)
  docSummaryRunAt: timestamp("doc_summary_run_at", { withTimezone: true }), // last daily document-summary run (shared across devices)
  docTemplates: text("doc_templates"),                             // JSON: DocTemplateConfig per content type
  letterConfig: text("letter_config"),                             // JSON: LetterConfig — persistent cover-letter guidance (structure/values/strengths/phrases/styleRules/noGos/referenceLetter)
  persona: text("persona"),                                        // 'schulabgaenger' | 'berufseinsteiger' | 'berufsumsteiger'
  sessionTimeout: text("session_timeout").default("15m"),
  uiLanguage: text("ui_language").default("de"),    // "de" | "en" — UI display language
  uiSettings: text("ui_settings"),                  // JSON UiSettings — per-user UI + AI-provider settings (no secrets), synced from the client store
  aiSecrets: text("ai_secrets"),                    // AES-256-GCM blob of { <AI_SECRET_PROVIDERS>?: key } API keys — never exported, never sent to the client
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
  displayName: text("display_name"),               // desktop profile name (falls back to email)
  authMode: text("auth_mode").notNull().default("password"), // "password" | "pin" | "none" — pin/none only in APP_MODE=desktop
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
export const userProfileInsertSchema = createInsertSchema(userProfile).omit({ id: true, createdAt: true, updatedAt: true, docSummaryRunAt: true }).partial();

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
  extraUrl: text("extra_url"),
  description: text("description"),
  tags: text("tags"),
  // AI digest of the file's content (PDF / Google Doc), built once and reused as
  // prompt context so generation never re-downloads the documents.
  contentSummary: text("content_summary"),
  summarizedAt: timestamp("summarized_at", { withTimezone: true }),
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
}).omit({ id: true, createdAt: true, updatedAt: true, userId: true, contentSummary: true, summarizedAt: true });
export const userDocumentPatchSchema = userDocumentInsertSchema.partial();
export type UserDocument = z.infer<typeof userDocumentSelectSchema>;

// Cloud providers that speak the OpenAI chat-completions protocol. One table drives the
// backend call, the model list, the settings page and the setup wizard. `baseUrl` already
// contains the version path (chat = `${baseUrl}/chat/completions`, models = `${baseUrl}/models`).
// `defaultModel` is only a fallback — the UI loads the provider's live model list.
export const COMPAT_PROVIDER_IDS = ["xai", "meta", "kimi", "kimiCn", "moonshot", "deepseek", "zai", "zaiCoding", "mimo", "mistral"] as const;
export type CompatProviderId = typeof COMPAT_PROVIDER_IDS[number];
/** Providers with an own stored key; `zaiCoding` reuses the `zai` key (same z.ai account, other billing). */
export const COMPAT_KEY_IDS = ["xai", "meta", "kimi", "kimiCn", "moonshot", "deepseek", "zai", "mimo", "mistral"] as const;
export type CompatKeyId = typeof COMPAT_KEY_IDS[number];
export const COMPAT_PROVIDERS: Record<CompatProviderId, { label: string; baseUrl: string; defaultModel: string; keyUrl: string; placeholder: string; keyOf: CompatKeyId; note?: "usOnly" | "codingPlan" | "china" }> = {
  xai:       { label: "Grok (xAI)",              baseUrl: "https://api.x.ai/v1",                 defaultModel: "grok-4",                keyUrl: "https://console.x.ai",                          placeholder: "xai-…", keyOf: "xai" },
  meta:      { label: "Muse (Meta)",             baseUrl: "https://api.meta.ai/v1",              defaultModel: "muse-spark-1.1",        keyUrl: "https://dev.meta.ai",                           placeholder: "…",     keyOf: "meta", note: "usOnly" },
  // Kimi Code = subscription; key and address differ per region and do not work with the Open Platform.
  kimi:      { label: "Kimi Code",               baseUrl: "https://api.kimi.ai/coding/v1",       defaultModel: "kimi-for-coding",       keyUrl: "https://www.kimi.ai/code/console",              placeholder: "sk-…",  keyOf: "kimi", note: "codingPlan" },
  kimiCn:    { label: "Kimi Code (China)",       baseUrl: "https://api.kimi.com/coding/v1",      defaultModel: "kimi-for-coding",       keyUrl: "https://www.kimi.com/code/console",             placeholder: "sk-…",  keyOf: "kimiCn", note: "china" },
  moonshot:  { label: "Kimi (Open Platform)",    baseUrl: "https://api.moonshot.ai/v1",          defaultModel: "kimi-latest",           keyUrl: "https://platform.moonshot.ai/console/api-keys", placeholder: "sk-…",  keyOf: "moonshot" },
  deepseek:  { label: "DeepSeek",                baseUrl: "https://api.deepseek.com/v1",         defaultModel: "deepseek-chat",         keyUrl: "https://platform.deepseek.com/api_keys",        placeholder: "sk-…",  keyOf: "deepseek" },
  zai:       { label: "GLM (Z.ai)",              baseUrl: "https://api.z.ai/api/paas/v4",        defaultModel: "glm-4.5v",              keyUrl: "https://z.ai/manage-apikey/apikey-list",        placeholder: "…",     keyOf: "zai" },
  // Same z.ai account, subscription billing: only counts via this address (the general one answers 1113, no credit).
  zaiCoding: { label: "GLM Coding Plan (Z.ai)",  baseUrl: "https://api.z.ai/api/coding/paas/v4", defaultModel: "glm-5.3-flash",         keyUrl: "https://z.ai/manage-apikey/apikey-list",        placeholder: "…",     keyOf: "zai", note: "codingPlan" },
  mimo:      { label: "MiMo (Xiaomi)",           baseUrl: "https://api.xiaomimimo.com/v1",       defaultModel: "mimo-v2.5",             keyUrl: "https://platform.xiaomimimo.com",               placeholder: "sk-…",  keyOf: "mimo" },
  mistral:   { label: "Mistral",                 baseUrl: "https://api.mistral.ai/v1",           defaultModel: "mistral-medium-latest", keyUrl: "https://console.mistral.ai/api-keys",           placeholder: "…",     keyOf: "mistral" },
};
export const isCompatProvider = (p: string): p is CompatProviderId => (COMPAT_PROVIDER_IDS as readonly string[]).includes(p);

export const aiConfigSchema = z.object({
  provider: z.enum(["none", "lm-studio", "anthropic", "openai", "gemini", "openrouter", "ollama", ...COMPAT_PROVIDER_IDS]).default("none"),
  // LM Studio
  lmStudioUrl: z.string().optional(),
  lmStudioModel: z.string().optional(),
  // Anthropic
  anthropicApiKey: z.string().optional(),
  // OpenAI
  openaiApiKey: z.string().optional(),
  openaiModel: z.string().optional(),
  // Google Gemini
  geminiApiKey: z.string().optional(),
  geminiModel: z.string().optional(),
  // OpenRouter
  openrouterApiKey: z.string().optional(),
  openrouterModel: z.string().optional(),
  // Ollama
  ollamaUrl: z.string().optional(),
  ollamaModel: z.string().optional(),
  // OpenAI-compatible cloud providers (COMPAT_PROVIDERS): key per provider, model per provider id
  xaiApiKey: z.string().optional(),
  metaApiKey: z.string().optional(),
  kimiApiKey: z.string().optional(),
  kimiCnApiKey: z.string().optional(),
  moonshotApiKey: z.string().optional(),
  deepseekApiKey: z.string().optional(),
  zaiApiKey: z.string().optional(),
  mimoApiKey: z.string().optional(),
  mistralApiKey: z.string().optional(),
  cloudModels: z.record(z.string(), z.string()).optional(),
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

// API keys that are stored server-side (encrypted, user_profile.ai_secrets) instead of in the browser.
export const AI_SECRET_PROVIDERS = ["anthropic", "openai", "gemini", "openrouter", ...COMPAT_KEY_IDS] as const;
export type AiSecretProvider = typeof AI_SECRET_PROVIDERS[number];
export const AI_SECRET_FIELDS = {
  anthropic: "anthropicApiKey", openai: "openaiApiKey", gemini: "geminiApiKey", openrouter: "openrouterApiKey",
  xai: "xaiApiKey", meta: "metaApiKey", kimi: "kimiApiKey", kimiCn: "kimiCnApiKey", moonshot: "moonshotApiKey", deepseek: "deepseekApiKey",
  zai: "zaiApiKey", mimo: "mimoApiKey", mistral: "mistralApiKey",
} as const satisfies Record<AiSecretProvider, `${AiSecretProvider}ApiKey`>;

/** GET /api/settings */
export interface UserSettingsResponse {
  /** Per-user UI settings (JSON from user_profile.ui_settings); null = never saved → client uploads its local state. */
  settings: Record<string, unknown> | null;
  /** Which API keys are stored server-side (values never leave the server). */
  secrets: Record<AiSecretProvider, boolean>;
  /** false = no encryption key configured (web without SECRETS_KEY/JWT_SECRET) → keys stay in the browser. */
  secretsAvailable: boolean;
}

export type AuthMode = "password" | "pin" | "none";
/** GET /api/auth/profiles (desktop only) */
export interface DesktopProfile { id: string; name: string; authMode: AuthMode }

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

// ─── CV versions (CV-Check) ───────────────────────────────────
// Structured CV, one row per saved version. The app holds the source of truth;
// Google Docs / PDFs are generated from `data`. Versions are append-only: every
// import, edit-save, optimisation or translation creates a new row (parentId links
// the chain). The current CV of a language = newest row with applicationId NULL.
export const cvVersions = pgTable("cv_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),                  // FK → users.id (multi-user isolation)
  lang: text("lang").notNull(),                       // "de" | "en" | "fr"
  origin: text("origin").notNull(),                   // "import" | "edit" | "optimize" | "translate"
  parentId: uuid("parent_id"),                        // previous version this one was derived from
  sourceDocumentId: uuid("source_document_id"),       // user_documents.id the import came from
  applicationId: uuid("application_id"),              // set for a CV tailored to one application
  data: text("data").notNull(),                       // JSON: CvDocument
  checkResult: text("check_result"),                  // JSON: score + findings (CV-Check), null until checked
  note: text("note"),                                 // short label, e.g. "Import aus CV-2026-de"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const CV_LANGUAGES = ["de", "en", "fr"] as const;
export type CvLanguage = typeof CV_LANGUAGES[number];

// Every item, bullet and section carries a stable `id` so versions and
// translations can be compared item by item.
export const cvBulletSchema = z.object({ id: z.string(), text: z.string() });
export const cvItemSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),        // job title / degree / skill group
  org: z.string().nullish(),          // employer / school / issuer
  location: z.string().nullish(),
  start: z.string().nullish(),        // "YYYY-MM" or "YYYY"
  end: z.string().nullish(),          // "YYYY-MM" | "YYYY" | "present"
  dateText: z.string().nullish(),     // dates exactly as written in the source
  text: z.string().nullish(),         // free paragraph (e.g. skills line, description)
  bullets: z.array(cvBulletSchema).default([]),
});
export const cvSectionKindSchema = z.enum(["summary", "experience", "education", "skills", "certifications", "languages", "projects", "achievements", "other"]);
export const cvSectionSchema = z.object({
  id: z.string(),
  kind: cvSectionKindSchema,
  title: z.string(),                  // heading exactly as written
  items: z.array(cvItemSchema).default([]),
});
export const cvBasicsSchema = z.object({
  name: z.string().nullish(),
  headline: z.string().nullish(),     // branding headline (target role)
  emails: z.array(z.string()).default([]),
  phones: z.array(z.string()).default([]),
  location: z.string().nullish(),
  linkedin: z.string().nullish(),
  website: z.string().nullish(),
  otherDetails: z.array(z.string()).default([]), // birth date, nationality, … as written
  summary: z.string().nullish(),
});
export const cvDocumentSchema = z.object({
  basics: cvBasicsSchema,
  sections: z.array(cvSectionSchema).default([]),
});
export type CvBullet = z.infer<typeof cvBulletSchema>;
export type CvItem = z.infer<typeof cvItemSchema>;
export type CvSection = z.infer<typeof cvSectionSchema>;
export type CvDocument = z.infer<typeof cvDocumentSchema>;
export const cvVersionSelectSchema = createSelectSchema(cvVersions);
export type CvVersionRow = z.infer<typeof cvVersionSelectSchema>;

// ─── LinkedIn (LinkedIn-Check + profile connection) ───────────
// Connection to the member's own LinkedIn data through the Member Data Portability
// API (EU/EEA + CH, read-only). Each user brings their own LinkedIn developer app
// (self-serve product), so client id/secret live per user. Credentials — never exported.
export const linkedinConnections = pgTable("linkedin_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().unique(),         // FK → users.id
  clientId: text("client_id"),                        // user's LinkedIn developer app
  clientSecret: text("client_secret"),
  requestedScope: text("requested_scope"),            // scope asked for in the OAuth flow (null = default)
  accessToken: text("access_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  scope: text("scope"),                               // scope LinkedIn granted
  method: text("method"),                             // "oauth" | "token" (pasted from the developer portal)
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncError: text("last_sync_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

// LinkedIn profile, one row per saved version (append-only, like cv_versions).
// The current profile = newest row with origin "import"; drafts/optimisations come later.
export const linkedinVersions = pgTable("linkedin_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  origin: text("origin").notNull(),                   // "import" | "draft" | "optimize"
  source: text("source").notNull(),                   // "api" | "zip" | "pdf" | "text" | "form" | "builder"
  lang: text("lang"),                                 // profile language, if known
  parentId: uuid("parent_id"),
  data: text("data").notNull(),                       // JSON: LinkedInProfile
  raw: text("raw"),                                   // source data as received (snapshot domains), for re-normalising
  checkResult: text("check_result"),                  // JSON: LinkedIn-Check result, null until checked
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

const liText = z.string().nullish();
const liDates = { start: liText, end: liText };       // dates as delivered ("Mar 2021", "2021-03", …)
export const linkedInProfileSchema = z.object({
  basics: z.object({
    firstName: liText, lastName: liText, headline: liText, summary: liText,
    location: liText, industry: liText, publicUrl: liText,
    websites: z.array(z.string()).default([]),
  }),
  positions: z.array(z.object({ id: z.string(), title: liText, company: liText, location: liText, description: liText, ...liDates })).default([]),
  education: z.array(z.object({ id: z.string(), school: liText, degree: liText, notes: liText, activities: liText, ...liDates })).default([]),
  skills: z.array(z.object({ name: z.string(), endorsements: z.number().nullish() })).default([]),
  certifications: z.array(z.object({ id: z.string(), name: z.string(), authority: liText, url: liText, ...liDates })).default([]),
  languages: z.array(z.object({ name: z.string(), proficiency: liText })).default([]),
  honors: z.array(z.object({ id: z.string(), title: z.string(), issuer: liText, date: liText, description: liText })).default([]),
  projects: z.array(z.object({ id: z.string(), title: z.string(), description: liText, url: liText, ...liDates })).default([]),
  publications: z.array(z.object({ id: z.string(), title: z.string(), publisher: liText, date: liText, description: liText, url: liText })).default([]),
  courses: z.array(z.object({ name: z.string() })).default([]),
  volunteering: z.array(z.object({ id: z.string(), role: liText, organization: liText, cause: liText, description: liText, ...liDates })).default([]),
  recommendations: z.object({
    received: z.array(z.object({ id: z.string(), author: liText, company: liText, jobTitle: liText, text: liText, date: liText })).default([]),
    givenCount: z.number().nullish(),
  }).default({}),
  activity: z.object({
    posts: z.array(z.object({ date: liText, text: liText, url: liText })).default([]),
    comments: z.array(z.object({ date: liText, text: liText, url: liText })).default([]),
    articles: z.array(z.object({ date: liText, title: liText, url: liText })).default([]),
  }).default({}),
  network: z.object({
    connections: z.number().nullish(),               // count only — names are never stored
    groups: z.array(z.string()).default([]),
  }).default({}),
  meta: z.object({
    source: z.string(),
    fetchedAt: z.string(),
    /** Parts this source cannot deliver (rated as "not rated", never guessed). */
    notProvided: z.array(z.string()).default([]),
    /** Snapshot domains that failed to load in this run. */
    failed: z.array(z.string()).default([]),
    /** Snapshot domains this source delivered (empty or not). Absent = legacy, treat all as delivered. */
    present: z.array(z.string()).optional(),
  }),
});
export type LinkedInProfile = z.infer<typeof linkedInProfileSchema>;

/** LinkedIn-Check user input, stored in user_profile.linkedin_state. */
export const linkedInStateSchema = z.object({
  journey: z.enum(["check", "build"]).nullish(),
  goal: z.object({
    kind: z.enum(["job", "clients", "switch", "visibility"]).nullish(),
    targetRole: z.string().max(120).nullish(),
    market: z.string().max(80).nullish(),
  }).nullish(),
  /** Points per self-report check id (photo, banner, featured.* …), 0 … max. */
  selfReport: z.record(z.string(), z.number().min(0).max(10)).nullish(),
  /** Check ids the user accepts as they are. */
  waivers: z.array(z.string().max(60)).max(100).nullish(),
  /** Done items of the tips/checklist page. */
  checklist: z.array(z.string().max(60)).max(200).nullish(),
  /** Answers of the build/sharpen questions (strengths, audience …), used by the text generator. */
  answers: z.record(z.string(), z.string().max(800)).nullish(),
  /** Positioning sentence per profile language: model options + the sentence the user confirmed. */
  positioning: z.record(z.string(), z.object({
    options: z.array(z.object({ text: z.string().max(400), angle: z.string().max(80).nullish() })).max(5).default([]),
    chosen: z.string().max(400).nullish(),
    createdAt: z.string().nullish(),
  })).nullish(),
});
export type LinkedInState = z.infer<typeof linkedInStateSchema>;

/** LinkedIn profile languages (LinkedIn allows one profile per language). */
export const LINKEDIN_LANGS = ["de", "en", "fr"] as const;
export type LinkedInLang = typeof LINKEDIN_LANGS[number];

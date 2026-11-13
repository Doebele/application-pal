DO $$ BEGIN
 CREATE TYPE "public"."application_stage" AS ENUM('import_validating', 'preparing_cv', 'preparing_letter', 'application_sent', 'pending', 'interview_1', 'interview_2', 'rejected', 'accepted');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."kb_insight_entity_type" AS ENUM('company', 'role');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."kb_source_kind" AS ENUM('url', 'pdf');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."kb_source_status" AS ENUM('pending', 'done', 'error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "application_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"activity_date" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "application_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"email" text,
	"linkedin_url" text,
	"phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "application_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft',
	"google_doc_id" text,
	"google_doc_url" text,
	"file_url" text,
	"user_document_id" text,
	"version" integer DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "application_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company" text NOT NULL,
	"role" text NOT NULL,
	"contact_person" text,
	"location" text,
	"url" text,
	"description" text,
	"notes" text,
	"stage" "application_stage" DEFAULT 'import_validating' NOT NULL,
	"priority" text,
	"source" text,
	"salary" text,
	"tags" text,
	"next_deadline" text,
	"portal_url" text,
	"logo_url" text,
	"kb_role_id" uuid,
	"archived" text DEFAULT 'false',
	"archive_reason" text,
	"match_score" integer,
	"match_details" text,
	"google_folder_id" text,
	"google_folder_url" text,
	"interview1_details" text,
	"interview2_details" text,
	"interview1_prep" text,
	"interview2_prep" text,
	"glassdoor_data" text,
	"kununu_data" text,
	"linkedin_data" text,
	"ai_results_cache" text,
	"job_type" text,
	"work_model" text,
	"contract_type" text,
	"language" text,
	"rav_application_type" text,
	"rav_proof" text,
	"applied_at" timestamp with time zone,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cv_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lang" text NOT NULL,
	"origin" text NOT NULL,
	"parent_id" uuid,
	"source_document_id" uuid,
	"application_id" uuid,
	"data" text NOT NULL,
	"check_result" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"scope" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"email" text,
	"used" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kb_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text,
	"name" text NOT NULL,
	"website" text,
	"industry" text,
	"size" text,
	"headquarters" text,
	"culture_notes" text,
	"agent_file_path" text,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kb_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"entity_type" "kb_insight_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"confidence" numeric(3, 2) DEFAULT '0.50' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kb_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text,
	"company_id" uuid,
	"title" text NOT NULL,
	"seniority" text,
	"requirements" text[],
	"salary_range" text,
	"agent_file_path" text,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kb_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url_or_path" text NOT NULL,
	"kind" "kb_source_kind" NOT NULL,
	"status" "kb_source_status" DEFAULT 'pending' NOT NULL,
	"raw_text" text,
	"error_message" text,
	"agent_file_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "linkedin_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" text,
	"client_secret" text,
	"requested_scope" text,
	"access_token" text,
	"expires_at" timestamp with time zone,
	"scope" text,
	"method" text,
	"connected_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "linkedin_connections_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "linkedin_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"origin" text NOT NULL,
	"source" text NOT NULL,
	"lang" text,
	"parent_id" uuid,
	"data" text NOT NULL,
	"raw" text,
	"check_result" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'sonstiges' NOT NULL,
	"file_type" text DEFAULT 'link' NOT NULL,
	"url" text,
	"extra_url" text,
	"description" text,
	"tags" text,
	"content_summary" text,
	"summarized_at" timestamp with time zone,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text,
	"phone" text,
	"location" text,
	"headline" text,
	"linkedin_url" text,
	"linkedin_bio" text,
	"photo_url" text,
	"master_cv" text,
	"personal_notes" text,
	"desired_salary" text,
	"google_calendar_id" text,
	"drive_applications_folder_id" text,
	"rav_sheet_id" text,
	"cv_master_lang" text,
	"cv_check_waivers" text,
	"linkedin_state" text,
	"doc_summary_run_at" timestamp with time zone,
	"doc_templates" text,
	"letter_config" text,
	"persona" text,
	"session_timeout" text DEFAULT '15m',
	"ui_language" text DEFAULT 'de',
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webauthn_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"device_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webauthn_credentials_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "applications" ADD CONSTRAINT "applications_kb_role_id_kb_roles_id_fk" FOREIGN KEY ("kb_role_id") REFERENCES "public"."kb_roles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kb_insights" ADD CONSTRAINT "kb_insights_source_id_kb_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."kb_sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kb_roles" ADD CONSTRAINT "kb_roles_company_id_kb_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."kb_companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

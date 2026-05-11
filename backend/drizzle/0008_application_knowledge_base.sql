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
DO $$ BEGIN
  CREATE TYPE "public"."kb_insight_entity_type" AS ENUM('company', 'role');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kb_companies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "website" text,
  "industry" text,
  "size" text,
  "headquarters" text,
  "culture_notes" text,
  "extracted_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kb_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "url_or_path" text NOT NULL,
  "kind" "kb_source_kind" NOT NULL,
  "status" "kb_source_status" NOT NULL DEFAULT 'pending',
  "raw_text" text,
  "error_message" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kb_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid,
  "title" text NOT NULL,
  "seniority" text,
  "requirements" text[],
  "salary_range" text,
  "extracted_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kb_insights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_id" uuid,
  "entity_type" "kb_insight_entity_type" NOT NULL,
  "entity_id" uuid NOT NULL,
  "confidence" numeric(3, 2) NOT NULL DEFAULT '0.50',
  "notes" text
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "kb_roles"
    ADD CONSTRAINT "kb_roles_company_id_kb_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."kb_companies"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "kb_insights"
    ADD CONSTRAINT "kb_insights_source_id_kb_sources_id_fk"
    FOREIGN KEY ("source_id") REFERENCES "public"."kb_sources"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "kb_role_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "applications"
    ADD CONSTRAINT "applications_kb_role_id_kb_roles_id_fk"
    FOREIGN KEY ("kb_role_id") REFERENCES "public"."kb_roles"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."application_stage" AS ENUM('import_validating', 'preparing_cv', 'preparing_letter', 'application_sent', 'pending', 'interview_1', 'interview_2', 'rejected', 'accepted');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company" text NOT NULL,
	"role" text NOT NULL,
	"location" text,
	"url" text,
	"description" text,
	"notes" text,
	"stage" "application_stage" DEFAULT 'import_validating' NOT NULL,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

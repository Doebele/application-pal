ALTER TABLE "kb_sources" ADD COLUMN IF NOT EXISTS "agent_file_path" text;
--> statement-breakpoint
ALTER TABLE "kb_companies" ADD COLUMN IF NOT EXISTS "slug" text;
--> statement-breakpoint
ALTER TABLE "kb_companies" ADD COLUMN IF NOT EXISTS "agent_file_path" text;
--> statement-breakpoint
ALTER TABLE "kb_roles" ADD COLUMN IF NOT EXISTS "slug" text;
--> statement-breakpoint
ALTER TABLE "kb_roles" ADD COLUMN IF NOT EXISTS "agent_file_path" text;

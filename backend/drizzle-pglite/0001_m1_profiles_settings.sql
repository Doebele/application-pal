ALTER TABLE "user_profile" ADD COLUMN "ui_settings" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "ai_secrets" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_mode" text DEFAULT 'password' NOT NULL;
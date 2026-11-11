-- Per-user settings + encrypted AI keys (user_profile), desktop profiles (users).
-- Apply manually to the Docker DB (no auto-migration), e.g.:
--   docker exec application-pal-db psql -U postgres -d application_pal -f - < backend/drizzle/0014_profiles_settings.sql
ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "ui_settings" text;
ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "ai_secrets" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auth_mode" text DEFAULT 'password' NOT NULL;

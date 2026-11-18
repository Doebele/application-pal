-- Dates & reminders (phase 5c): application deadline as a real date (YYYY-MM-DD).
-- Apply manually to the Docker DB (no auto-migration), e.g.:
--   docker exec -i application-pal-db psql -U postgres -d application_pal < backend/drizzle/0016_apply_deadline.sql
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "apply_deadline" text;

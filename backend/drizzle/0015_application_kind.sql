-- School-leaver letters: kind of application, apprenticeship title, contact salutation.
-- Apply manually to the Docker DB (no auto-migration), e.g.:
--   docker exec -i application-pal-db psql -U postgres -d application_pal < backend/drizzle/0015_application_kind.sql
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "application_kind" text;
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "apprenticeship" text;
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "contact_gender" text;

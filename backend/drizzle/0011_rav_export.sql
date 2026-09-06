-- RAV / ORP proof-of-job-search export
-- Per-application overrides for the two sheet columns that have no other source;
-- NULL means "derive it" (see backend/src/rav.ts).
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "rav_application_type" text;
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "rav_proof" text;

-- The single target spreadsheet the export writes into, per user.
ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "rav_sheet_id" text;

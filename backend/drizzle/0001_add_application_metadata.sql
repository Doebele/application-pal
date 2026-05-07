ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "priority" text;
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "source" text;
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "salary" text;
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "tags" text;
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "next_deadline" text;

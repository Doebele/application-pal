-- Cached AI digest of each document's file content (PDF / Google Doc),
-- reused as prompt context instead of re-reading the file on every generation.
ALTER TABLE "user_documents" ADD COLUMN IF NOT EXISTS "content_summary" text;
ALTER TABLE "user_documents" ADD COLUMN IF NOT EXISTS "summarized_at" timestamp with time zone;

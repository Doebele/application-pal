-- Last daily document-summary run per user, so several devices/browsers don't each repeat it.
ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "doc_summary_run_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "application_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "name" text NOT NULL,
  "status" text DEFAULT 'draft',
  "google_doc_id" text,
  "google_doc_url" text,
  "file_url" text,
  "version" integer DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

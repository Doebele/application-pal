CREATE TABLE IF NOT EXISTS "user_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL DEFAULT 'sonstiges',
  "file_type" text NOT NULL DEFAULT 'link',
  "url" text,
  "description" text,
  "tags" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

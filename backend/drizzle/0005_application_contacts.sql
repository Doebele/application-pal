CREATE TABLE IF NOT EXISTS "application_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "role" text,
  "email" text,
  "linkedin_url" text,
  "phone" text,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

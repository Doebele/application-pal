CREATE TABLE IF NOT EXISTS "user_profile" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text,
  "email" text,
  "phone" text,
  "location" text,
  "headline" text,
  "linkedin_url" text,
  "linkedin_bio" text,
  "photo_url" text,
  "master_cv" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

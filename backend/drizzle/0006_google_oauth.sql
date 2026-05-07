CREATE TABLE IF NOT EXISTS "google_oauth_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "access_token" text NOT NULL,
  "refresh_token" text,
  "expires_at" timestamptz,
  "scope" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

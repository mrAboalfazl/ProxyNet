-- Add public_slug to users (nullable, backfill, then set NOT NULL + UNIQUE)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "public_slug" TEXT;

-- Backfill any existing users with a 12-char random slug
UPDATE "users"
  SET "public_slug" = substr(md5(random()::text || id::text), 1, 12)
  WHERE "public_slug" IS NULL;

ALTER TABLE "users" ALTER COLUMN "public_slug" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "users_public_slug_key" ON "users"("public_slug");

-- Forwarders table
CREATE TABLE IF NOT EXISTS "forwarders" (
  "id"                  BIGSERIAL PRIMARY KEY,
  "user_id"             BIGINT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "slug"                TEXT NOT NULL,
  "label"               TEXT NOT NULL,
  "target_url"          TEXT NOT NULL,
  "preserve_path"       BOOLEAN NOT NULL DEFAULT TRUE,
  "preserve_query"      BOOLEAN NOT NULL DEFAULT TRUE,
  "forward_auth_header" BOOLEAN NOT NULL DEFAULT TRUE,
  "enabled"             BOOLEAN NOT NULL DEFAULT TRUE,
  "call_count"          BIGINT NOT NULL DEFAULT 0,
  "bytes_in"            BIGINT NOT NULL DEFAULT 0,
  "bytes_out"           BIGINT NOT NULL DEFAULT 0,
  "last_used_at"        TIMESTAMP(3),
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "forwarders_slug_key" ON "forwarders"("slug");
CREATE INDEX IF NOT EXISTS "forwarders_user_id_enabled_idx" ON "forwarders"("user_id", "enabled");

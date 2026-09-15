-- Application-level authorization role. Existing accounts remain standard users.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'user';

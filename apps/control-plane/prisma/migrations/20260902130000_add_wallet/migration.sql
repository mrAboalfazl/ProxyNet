-- Wallets: one per user, auto-created on first access
CREATE TABLE IF NOT EXISTS "wallets" (
  "user_id"       BIGINT PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "balance_toman" BIGINT NOT NULL DEFAULT 0,
  "currency"      TEXT   NOT NULL DEFAULT 'IRR',
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Immutable transaction ledger
CREATE TABLE IF NOT EXISTS "wallet_transactions" (
  "id"                  BIGSERIAL PRIMARY KEY,
  "wallet_user_id"      BIGINT NOT NULL REFERENCES "wallets"("user_id") ON DELETE CASCADE,
  "amount_toman"        BIGINT NOT NULL,
  "type"                TEXT   NOT NULL,
  "description"         TEXT,
  "balance_after_toman" BIGINT NOT NULL,
  "metadata"            JSONB,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "wallet_transactions_wallet_user_id_created_at_idx"
  ON "wallet_transactions"("wallet_user_id", "created_at" DESC);

-- Admin-editable pricing + platform settings
CREATE TABLE IF NOT EXISTS "settings" (
  "key"        TEXT PRIMARY KEY,
  "value"      TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed default pricing (skips if already present)
INSERT INTO "settings" ("key", "value") VALUES
  ('pricing.per_request_toman',       '10'),
  ('pricing.per_mb_toman',            '50'),
  ('pricing.min_balance_toman',       '100')
ON CONFLICT ("key") DO NOTHING;

-- Backfill wallets for existing users so nobody hits a null on first request
INSERT INTO "wallets" ("user_id")
  SELECT "id" FROM "users"
  WHERE NOT EXISTS (SELECT 1 FROM "wallets" WHERE "wallets"."user_id" = "users"."id");

-- Grants: the platform user needs access to the new tables + sequences
-- (platform user is not the schema owner on this DB — same pattern as other migrations)

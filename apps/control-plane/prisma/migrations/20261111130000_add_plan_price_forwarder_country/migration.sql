-- Add plan pricing and per-forwarder exit country
ALTER TABLE "plans" ADD COLUMN "price_toman" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "forwarders" ADD COLUMN "country_code" TEXT;

CREATE INDEX "forwarders_country_code_idx" ON "forwarders"("country_code");

-- Ordered list of exit countries for multi-country forwarder failover
ALTER TABLE "forwarders" ADD COLUMN "country_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

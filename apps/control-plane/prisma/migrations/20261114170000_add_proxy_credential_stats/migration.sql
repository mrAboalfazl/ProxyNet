-- AlterTable
ALTER TABLE "proxy_credentials" ADD COLUMN "call_count" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "proxy_credentials" ADD COLUMN "bytes_in" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "proxy_credentials" ADD COLUMN "bytes_out" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "proxy_credentials" ADD COLUMN "last_used_at" TIMESTAMP(3);

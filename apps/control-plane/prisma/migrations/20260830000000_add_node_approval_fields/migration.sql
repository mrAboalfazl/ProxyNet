-- AlterTable: add node approval fields
ALTER TABLE "nodes" ADD COLUMN "submitted_by_id" BIGINT;
ALTER TABLE "nodes" ADD COLUMN "approved_by_id" BIGINT;
ALTER TABLE "nodes" ADD COLUMN "approved_at" TIMESTAMP(3);

ALTER TABLE "nodes" ADD CONSTRAINT "nodes_submitted_by_id_fkey"
  FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "nodes" ADD CONSTRAINT "nodes_approved_by_id_fkey"
  FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Platform nodes remain public. User-submitted nodes become private, never
-- implicitly shared on behalf of their owner.
ALTER TABLE "nodes" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'private',
 ADD COLUMN "sharing_requested" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "user_paused" BOOLEAN NOT NULL DEFAULT false;
UPDATE "nodes" SET "visibility" = 'public' WHERE "submitted_by_id" IS NULL;
ALTER TABLE "forwarders" ADD COLUMN "exit_node_id" BIGINT;
ALTER TABLE "proxy_credentials" ADD COLUMN "exit_node_id" BIGINT;
CREATE INDEX "nodes_visibility_submitted_by_id_idx" ON "nodes"("visibility", "submitted_by_id");
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_visibility_check" CHECK ("visibility" IN ('private', 'public'));
ALTER TABLE "forwarders" ADD CONSTRAINT "forwarders_exit_node_id_fkey" FOREIGN KEY ("exit_node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proxy_credentials" ADD CONSTRAINT "proxy_credentials_exit_node_id_fkey" FOREIGN KEY ("exit_node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

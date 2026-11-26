-- Projects (zones) group forwarders and proxy credentials into one workspace.
CREATE TABLE "projects" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "default_mode" TEXT NOT NULL DEFAULT 'auto',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");
CREATE INDEX "projects_user_id_idx" ON "projects"("user_id");

ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "forwarders" ADD COLUMN "project_id" BIGINT;
CREATE INDEX "forwarders_project_id_idx" ON "forwarders"("project_id");
ALTER TABLE "forwarders" ADD CONSTRAINT "forwarders_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "proxy_credentials" ADD COLUMN "project_id" BIGINT;
ALTER TABLE "proxy_credentials" ADD COLUMN "country_code" TEXT;
ALTER TABLE "proxy_credentials" ADD COLUMN "routing_mode" TEXT NOT NULL DEFAULT 'auto';
CREATE INDEX "proxy_credentials_project_id_idx" ON "proxy_credentials"("project_id");
ALTER TABLE "proxy_credentials" ADD CONSTRAINT "proxy_credentials_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

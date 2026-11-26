-- Add WireGuard/AmneziaWG to TransportType
ALTER TYPE "TransportType" ADD VALUE IF NOT EXISTS 'wireguard';
ALTER TYPE "TransportType" ADD VALUE IF NOT EXISTS 'amneziawg';

-- Create UpstreamProtocol and UpstreamStatus enums
CREATE TYPE "UpstreamProtocol" AS ENUM ('wireguard', 'amneziawg', 'socks5', 'http');
CREATE TYPE "UpstreamStatus" AS ENUM ('pending', 'healthy', 'degraded', 'unhealthy', 'disabled');

-- Add tunnel_proxy_port to nodes
ALTER TABLE "nodes" ADD COLUMN "tunnel_proxy_port" INTEGER NOT NULL DEFAULT 9444;

-- Create upstream_tunnels table
CREATE TABLE "upstream_tunnels" (
    "id" BIGSERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "protocol" "UpstreamProtocol" NOT NULL,
    "host_node_id" BIGINT,
    "country_code" TEXT NOT NULL,
    "config_encrypted" TEXT NOT NULL,
    "endpoint_preview" TEXT,
    "has_junk_obfuscation" BOOLEAN NOT NULL DEFAULT false,
    "mtu" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "UpstreamStatus" NOT NULL DEFAULT 'pending',
    "exit_ip" TEXT,
    "latency_ms" INTEGER,
    "ai_check_status" JSONB,
    "last_error" TEXT,
    "last_checked_at" TIMESTAMP(3),
    "bytes_in" BIGINT NOT NULL DEFAULT 0,
    "bytes_out" BIGINT NOT NULL DEFAULT 0,
    "request_count" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upstream_tunnels_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "upstream_tunnels_host_node_id_enabled_idx" ON "upstream_tunnels"("host_node_id", "enabled");
CREATE INDEX "upstream_tunnels_country_code_enabled_status_idx" ON "upstream_tunnels"("country_code", "enabled", "status");

ALTER TABLE "upstream_tunnels"
    ADD CONSTRAINT "upstream_tunnels_host_node_id_fkey"
    FOREIGN KEY ("host_node_id") REFERENCES "nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "upstream_tunnels"
    ADD CONSTRAINT "upstream_tunnels_country_code_fkey"
    FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Extend forwarders with routing_mode, upstream_tunnel_id, streaming_enabled
ALTER TABLE "forwarders"
    ADD COLUMN "routing_mode" TEXT NOT NULL DEFAULT 'auto',
    ADD COLUMN "upstream_tunnel_id" BIGINT,
    ADD COLUMN "streaming_enabled" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "forwarders_upstream_tunnel_id_idx" ON "forwarders"("upstream_tunnel_id");

ALTER TABLE "forwarders"
    ADD CONSTRAINT "forwarders_upstream_tunnel_id_fkey"
    FOREIGN KEY ("upstream_tunnel_id") REFERENCES "upstream_tunnels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

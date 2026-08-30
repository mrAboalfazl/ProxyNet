-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'banned', 'pending');

-- CreateEnum
CREATE TYPE "AuthMethod" AS ENUM ('password', 'totp', 'sms_otp', 'email_otp', 'telegram_otp');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'expired', 'cancelled', 'suspended');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'completed', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "UsageEventType" AS ENUM ('http_request', 'tcp_session', 'udp_flow', 'ws_session');

-- CreateEnum
CREATE TYPE "TrustState" AS ENUM ('pending', 'trusted', 'restricted', 'blocked');

-- CreateEnum
CREATE TYPE "NodeStatus" AS ENUM ('pending', 'active', 'healthy', 'degraded', 'unhealthy', 'quarantined', 'disabled', 'draining');

-- CreateEnum
CREATE TYPE "TransportType" AS ENUM ('reality', 'ss2022', 'hysteria2', 'https', 'grpc');

-- CreateEnum
CREATE TYPE "EndpointStatus" AS ENUM ('reserved', 'active', 'burned', 'rotating', 'disabled');

-- CreateEnum
CREATE TYPE "IpStatus" AS ENUM ('reserved', 'active', 'burned');

-- CreateEnum
CREATE TYPE "PolicyScope" AS ENUM ('GLOBAL', 'AUTO_ONLY', 'COUNTRY_ONLY', 'USER', 'PLAN', 'COUNTRY', 'PROTOCOL', 'DESTINATION');

-- CreateEnum
CREATE TYPE "PolicyAction" AS ENUM ('force_country', 'prefer_country', 'block', 'allow', 'set_relay', 'bypass_country');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'reviewing', 'resolved', 'dismissed');

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "telegram_id" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_credentials" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "method" "AuthMethod" NOT NULL,
    "credential_hash" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "telegram_id" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proxy_credentials" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "uuid" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "label" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "proxy_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "monthly_bandwidth_gb" DECIMAL(12,3) NOT NULL,
    "max_concurrent_sessions" INTEGER NOT NULL DEFAULT 10,
    "allowed_protocols" TEXT[],
    "allowed_countries" TEXT[],
    "auto_mode_enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority_class" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "plan_id" BIGINT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "subscription_id" BIGINT,
    "amount_cents" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "method" TEXT,
    "external_ref" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_accounts" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "subscription_id" BIGINT,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "bytes_used" BIGINT NOT NULL DEFAULT 0,
    "connections_used" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_tokens" (
    "id" TEXT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "credential_uuid" TEXT NOT NULL,
    "bytes_remaining" BIGINT NOT NULL,
    "conns_remaining" INTEGER NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "invalidated_at" TIMESTAMP(3),

    CONSTRAINT "quota_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "node_id" BIGINT,
    "session_id" TEXT,
    "event_type" "UsageEventType" NOT NULL,
    "protocol" TEXT NOT NULL,
    "bytes_in" BIGINT NOT NULL DEFAULT 0,
    "bytes_out" BIGINT NOT NULL DEFAULT 0,
    "session_seconds" INTEGER NOT NULL DEFAULT 0,
    "exit_country" TEXT,
    "exit_node_id" BIGINT,
    "destination" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_routing_preferences" (
    "user_id" BIGINT NOT NULL,
    "routing_mode" TEXT NOT NULL DEFAULT 'auto',
    "preferred_country" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_routing_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "countries" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "auto_mode_eligible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "node_providers" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contact_email" TEXT,
    "trust_state" "TrustState" NOT NULL DEFAULT 'pending',
    "contract_status" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nodes" (
    "id" BIGSERIAL NOT NULL,
    "provider_id" BIGINT,
    "country_code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "roles" TEXT[],
    "status" "NodeStatus" NOT NULL DEFAULT 'pending',
    "ipv4_address" TEXT,
    "ipv6_address" TEXT,
    "reported_country" TEXT,
    "verified_country" TEXT,
    "verified_asn" TEXT,
    "verified_provider" TEXT,
    "last_geo_verified_at" TIMESTAMP(3),
    "enrollment_token" TEXT,
    "enrollment_token_expires_at" TIMESTAMP(3),
    "config_version" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_capabilities" (
    "id" BIGSERIAL NOT NULL,
    "node_id" BIGINT NOT NULL,
    "protocol" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "node_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_heartbeats" (
    "id" BIGSERIAL NOT NULL,
    "node_id" BIGINT NOT NULL,
    "agent_version" TEXT,
    "config_version" BIGINT,
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_health_checks" (
    "id" BIGSERIAL NOT NULL,
    "node_id" BIGINT NOT NULL,
    "check_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latency_ms" INTEGER,
    "packet_loss_pct" DECIMAL(5,2),
    "notes" TEXT,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_health_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_metrics" (
    "id" BIGSERIAL NOT NULL,
    "node_id" BIGINT NOT NULL,
    "active_sessions" INTEGER,
    "bytes_in_rate" BIGINT,
    "bytes_out_rate" BIGINT,
    "cpu_pct" DECIMAL(5,2),
    "mem_pct" DECIMAL(5,2),
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edge_endpoints" (
    "id" BIGSERIAL NOT NULL,
    "node_id" BIGINT NOT NULL,
    "transport_type" "TransportType" NOT NULL,
    "ip_address" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "domain" TEXT,
    "public_key" TEXT,
    "config_json" JSONB,
    "status" "EndpointStatus" NOT NULL DEFAULT 'active',
    "reachability_score" DECIMAL(4,3) NOT NULL DEFAULT 1.0,
    "burned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edge_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_pools" (
    "id" BIGSERIAL NOT NULL,
    "node_id" BIGINT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "status" "IpStatus" NOT NULL DEFAULT 'reserved',
    "assigned_at" TIMESTAMP(3),
    "burned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ip_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edge_reachability_stats" (
    "id" BIGSERIAL NOT NULL,
    "endpoint_id" BIGINT NOT NULL,
    "source" TEXT NOT NULL,
    "source_region" TEXT,
    "success" BOOLEAN NOT NULL,
    "latency_ms" INTEGER,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edge_reachability_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "scope" "PolicyScope" NOT NULL,
    "action" "PolicyAction" NOT NULL,
    "target_country" TEXT,
    "target_node_id" BIGINT,
    "applies_to_user_id" BIGINT,
    "applies_to_plan_id" BIGINT,
    "created_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_rules" (
    "id" BIGSERIAL NOT NULL,
    "policy_id" BIGINT NOT NULL,
    "match_type" TEXT NOT NULL,
    "match_value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_versions" (
    "id" BIGSERIAL NOT NULL,
    "version" BIGINT NOT NULL,
    "description" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_decisions" (
    "id" TEXT NOT NULL,
    "user_id" BIGINT,
    "session_id" TEXT,
    "destination" TEXT,
    "protocol" TEXT,
    "requested_mode" TEXT,
    "requested_country" TEXT,
    "effective_policy" JSONB,
    "candidate_nodes" BIGINT[],
    "selected_relay_chain" BIGINT[],
    "selected_exit" BIGINT,
    "selection_score" DECIMAL(10,4),
    "selection_reason" TEXT,
    "config_version" BIGINT,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection_affinities" (
    "session_id" TEXT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "exit_node_id" BIGINT,
    "relay_chain" BIGINT[],
    "country_code" TEXT,
    "protocol" TEXT,
    "established_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "terminated_at" TIMESTAMP(3),

    CONSTRAINT "connection_affinities_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "bans" (
    "id" BIGSERIAL NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_by" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocklist_entries" (
    "id" BIGSERIAL NOT NULL,
    "match_type" TEXT NOT NULL,
    "match_value" TEXT NOT NULL,
    "reason" TEXT,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "blocklist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abuse_reports" (
    "id" BIGSERIAL NOT NULL,
    "reporter_email" TEXT,
    "report_type" TEXT NOT NULL,
    "target_domain" TEXT,
    "target_ip" TEXT,
    "description" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "assigned_to" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "abuse_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_credentials_user_id_method_key" ON "user_credentials"("user_id", "method");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "proxy_credentials_uuid_key" ON "proxy_credentials"("uuid");

-- CreateIndex
CREATE INDEX "proxy_credentials_user_id_idx" ON "proxy_credentials"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_period_end_idx" ON "subscriptions"("period_end");

-- CreateIndex
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "usage_accounts_user_id_key" ON "usage_accounts"("user_id");

-- CreateIndex
CREATE INDEX "quota_tokens_credential_uuid_expires_at_idx" ON "quota_tokens"("credential_uuid", "expires_at");

-- CreateIndex
CREATE INDEX "usage_events_user_id_occurred_at_idx" ON "usage_events"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "nodes_country_code_status_idx" ON "nodes"("country_code", "status");

-- CreateIndex
CREATE UNIQUE INDEX "node_capabilities_node_id_protocol_transport_key" ON "node_capabilities"("node_id", "protocol", "transport");

-- CreateIndex
CREATE INDEX "node_heartbeats_node_id_reported_at_idx" ON "node_heartbeats"("node_id", "reported_at" DESC);

-- CreateIndex
CREATE INDEX "node_health_checks_node_id_checked_at_idx" ON "node_health_checks"("node_id", "checked_at" DESC);

-- CreateIndex
CREATE INDEX "node_metrics_node_id_recorded_at_idx" ON "node_metrics"("node_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "edge_endpoints_node_id_status_idx" ON "edge_endpoints"("node_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ip_pools_ip_address_key" ON "ip_pools"("ip_address");

-- CreateIndex
CREATE INDEX "edge_reachability_stats_endpoint_id_recorded_at_idx" ON "edge_reachability_stats"("endpoint_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "policy_rules_policy_id_idx" ON "policy_rules"("policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "config_versions_version_key" ON "config_versions"("version");

-- CreateIndex
CREATE INDEX "route_decisions_user_id_decided_at_idx" ON "route_decisions"("user_id", "decided_at" DESC);

-- CreateIndex
CREATE INDEX "route_decisions_decided_at_idx" ON "route_decisions"("decided_at" DESC);

-- CreateIndex
CREATE INDEX "connection_affinities_user_id_idx" ON "connection_affinities"("user_id");

-- CreateIndex
CREATE INDEX "connection_affinities_expires_at_idx" ON "connection_affinities"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "bans_target_type_target_value_key" ON "bans"("target_type", "target_value");

-- CreateIndex
CREATE INDEX "blocklist_entries_match_type_match_value_idx" ON "blocklist_entries"("match_type", "match_value");

-- CreateIndex
CREATE UNIQUE INDEX "blocklist_entries_match_type_match_value_key" ON "blocklist_entries"("match_type", "match_value");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_occurred_at_idx" ON "audit_logs"("actor_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs"("occurred_at" DESC);

-- AddForeignKey
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proxy_credentials" ADD CONSTRAINT "proxy_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_accounts" ADD CONSTRAINT "usage_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_routing_preferences" ADD CONSTRAINT "user_routing_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "node_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_capabilities" ADD CONSTRAINT "node_capabilities_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_heartbeats" ADD CONSTRAINT "node_heartbeats_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_health_checks" ADD CONSTRAINT "node_health_checks_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_metrics" ADD CONSTRAINT "node_metrics_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edge_endpoints" ADD CONSTRAINT "edge_endpoints_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_pools" ADD CONSTRAINT "ip_pools_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edge_reachability_stats" ADD CONSTRAINT "edge_reachability_stats_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "edge_endpoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_target_country_fkey" FOREIGN KEY ("target_country") REFERENCES "countries"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_decisions" ADD CONSTRAINT "route_decisions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_affinities" ADD CONSTRAINT "connection_affinities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bans" ADD CONSTRAINT "bans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

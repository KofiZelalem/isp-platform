-- Stage 16: Durable network-agent heartbeat state
CREATE TYPE "AgentTunnelState" AS ENUM ('DISABLED', 'UP', 'DOWN', 'ERROR', 'UNKNOWN');

CREATE TABLE "agent_heartbeats" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "node_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "last_heartbeat_at" TIMESTAMP(3) NOT NULL,
  "tunnel_state" "AgentTunnelState" NOT NULL DEFAULT 'UNKNOWN',
  "last_error" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_heartbeats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_heartbeats_node_id_key" ON "agent_heartbeats"("node_id");
CREATE UNIQUE INDEX "agent_heartbeats_agent_id_key" ON "agent_heartbeats"("agent_id");
CREATE INDEX "agent_heartbeats_organization_id_idx" ON "agent_heartbeats"("organization_id");
CREATE INDEX "agent_heartbeats_organization_id_last_heartbeat_at_idx" ON "agent_heartbeats"("organization_id", "last_heartbeat_at");

ALTER TABLE "agent_heartbeats" ADD CONSTRAINT "agent_heartbeats_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_heartbeats" ADD CONSTRAINT "agent_heartbeats_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "network_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
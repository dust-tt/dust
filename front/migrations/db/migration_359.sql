-- Migration created on Sep 16, 2025
ALTER TABLE "public"."agent_mcp_server_configurations" ADD COLUMN "secretName" VARCHAR(255);

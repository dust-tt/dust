-- Migration created on May 15, 2025
ALTER TABLE "public"."agent_mcp_server_configurations" ADD COLUMN "jsonSchema" JSONB;

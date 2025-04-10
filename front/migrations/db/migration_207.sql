-- Migration created on Apr 09, 2025
ALTER TABLE "public"."agent_mcp_server_configurations"
  ADD COLUMN "additionalConfiguration" JSONB;

UPDATE "public"."agent_mcp_server_configurations"
SET "additionalConfiguration" = '{}';

ALTER TABLE "public"."agent_mcp_server_configurations"
  ALTER COLUMN "additionalConfiguration" SET NOT NULL;

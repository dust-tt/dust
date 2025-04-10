-- Migration created on Apr 09, 2025
ALTER TABLE "public"."agent_mcp_server_configurations"
ADD COLUMN "name" VARCHAR(255);

ALTER TABLE "public"."agent_mcp_server_configurations"
ADD COLUMN "singleToolDescriptionOverride" TEXT;
ALTER TABLE "public"."agent_mcp_server_configurations"
DROP COLUMN "serverType",
DROP COLUMN "internalMCPServerId",
DROP COLUMN "remoteMCPServerId";

ALTER TABLE "public"."agent_mcp_actions"
DROP COLUMN "mcpServerId";
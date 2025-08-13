-- Migration created on Aug 13, 2025
ALTER TABLE "public"."remote_mcp_server_tool_metadata" ADD COLUMN "internalMCPServerId" VARCHAR(255);
ALTER TABLE "public"."remote_mcp_server_tool_metadata" ALTER COLUMN "remoteMCPServerId" DROP NOT NULL;
ALTER TABLE "remote_mcp_server_tool_metadata" ADD CONSTRAINT "check_mcp_server_id_not_both_null" CHECK (
    ("internalMCPServerId" IS NOT NULL AND "remoteMCPServerId" IS NULL) OR
    ("internalMCPServerId" IS NULL AND "remoteMCPServerId" IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS "remote_mcp_server_tool_metadata_wid_internalserversid_tool_name" ON "remote_mcp_server_tool_metadata" USING btree ("workspaceId", "internalMCPServerId", "toolName");

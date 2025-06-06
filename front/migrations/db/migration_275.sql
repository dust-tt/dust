-- Migration created on Jan 30, 2025
ALTER TABLE "public"."remote_mcp_server_tool_metadata" 
ALTER COLUMN "remoteMCPServerId" TYPE bigint;

-- Migration created on Jul 31, 2025
ALTER TABLE "public"."remote_mcp_server_tool_metadata" ADD COLUMN "enabled" BOOLEAN DEFAULT true;

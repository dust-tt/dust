-- Migration created on Feb 25, 2026
ALTER TABLE "public"."agent_mcp_action_output_items" ADD COLUMN "contentGcsPath" TEXT;
CREATE INDEX CONCURRENTLY "agent_mcp_action_output_items_ws_action_gcs_path" ON "agent_mcp_action_output_items" ("workspaceId", "agentMCPActionId", "contentGcsPath");

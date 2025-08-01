-- Migration created on Jul 23, 2025
CREATE INDEX CONCURRENTLY "agent_mcp_action_output_items_workspace_id" ON "agent_mcp_action_output_items" ("workspaceId");

-- Migration created on Oct 29, 2025
CREATE INDEX CONCURRENTLY "agent_mcp_action_output_items_workspace_id_id" ON "agent_mcp_action_output_items" ("workspaceId", "id");

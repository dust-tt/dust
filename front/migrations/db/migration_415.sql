-- Migration created on Nov 24, 2024

CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_mcp_action_output_items_workspace_id_agent_mcp_action_id"
ON "agent_mcp_action_output_items" ("workspaceId", "agentMCPActionId");

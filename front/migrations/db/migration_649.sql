-- Migration created on May 21, 2026
CREATE INDEX CONCURRENTLY "group_agents_group_id" ON "group_agents" ("groupId");
CREATE INDEX CONCURRENTLY "agent_mcp_srv_config_mcp_view_id_w_id" ON "agent_mcp_server_configurations" ("mcpServerViewId", "workspaceId");

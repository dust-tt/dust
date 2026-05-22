-- Migration created on May 22, 2026
CREATE INDEX CONCURRENTLY "agent_mcp_srv_config_mcp_srv_view_id" ON "agent_mcp_server_configurations" ("mcpServerViewId");
DROP INDEX CONCURRENTLY "agent_mcp_srv_config_mcp_view_id_w_id";

-- Migration created on May 13, 2025
CREATE INDEX CONCURRENTLY "agent_mcp_srv_config_w_id_agent_config_id" ON "agent_mcp_server_configurations" ("workspaceId", "agentConfigurationId");

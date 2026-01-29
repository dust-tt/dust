-- Migration created on Jan 27, 2026
CREATE TABLE IF NOT EXISTS "agent_project_configurations"
(
    "createdAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
    "workspaceId"              BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                       BIGSERIAL,
    "mcpServerConfigurationId" BIGINT                   NOT NULL REFERENCES "agent_mcp_server_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "projectId"                BIGINT                   NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY "agent_project_config_workspace_id_mcp_srv_config_id"
    ON "agent_project_configurations" ("workspaceId", "mcpServerConfigurationId");
CREATE INDEX CONCURRENTLY "agent_project_config_workspace_id_project_id"
    ON "agent_project_configurations" ("workspaceId", "projectId");

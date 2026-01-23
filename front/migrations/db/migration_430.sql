-- Migration created on Dec 08, 2025
CREATE TABLE IF NOT EXISTS "skill_mcp_server_configurations" (
    "id" BIGSERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "skillConfigurationId" BIGINT NOT NULL REFERENCES "skill_configurations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "mcpServerViewId" BIGINT NOT NULL REFERENCES "mcp_server_views" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_skill_mcp_server_config_workspace_skill_config"
    ON "skill_mcp_server_configurations" ("workspaceId", "skillConfigurationId");

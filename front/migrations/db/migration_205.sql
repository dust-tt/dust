-- Migration created on Apr 08, 2025
CREATE TABLE IF NOT EXISTS "child_agent_configurations"
(
  "createdAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt"                TIMESTAMP WITH TIME ZONE NOT NULL,
  "workspaceId"              BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "id"                       BIGSERIAL,
  "mcpServerConfigurationId" BIGINT                   NOT NULL REFERENCES "agent_mcp_server_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY ("id")
);
CREATE INDEX "child_agent_configurations_mcp_server_configuration_id" ON "child_agent_configurations" ("mcpServerConfigurationId");

-- Migration created on Aug 16, 2025
CREATE TABLE IF NOT EXISTS "triggers" (
    "createdAt" timestamp WITH time zone NOT NULL,
    "updatedAt" timestamp WITH time zone NOT NULL,
    "sId" varchar(255) NOT NULL,
    "name" varchar(255) NOT NULL,
    "description" varchar(255) NOT NULL,
    "agentConfigurationId" varchar(255) NOT NULL,
    "kind" varchar(255) NOT NULL,
    "configuration" jsonb DEFAULT NULL,
    "workspaceId" bigint NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id" bigserial,
    PRIMARY KEY ("id")
);

CREATE INDEX "triggers_workspace_id" ON "triggers" ("workspaceId");
CREATE INDEX "triggers_workspace_id_agent_configuration_id" ON "triggers" ("workspaceId", "agentConfigurationId");
CREATE INDEX "triggers_workspace_id_name" ON "triggers" ("workspaceId", "name");


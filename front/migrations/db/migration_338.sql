-- Migration created on Aug 19, 2025
CREATE TABLE IF NOT EXISTS "triggers" (
    "createdAt" timestamp WITH time zone NOT NULL,
    "updatedAt" timestamp WITH time zone NOT NULL,
    "sId" varchar(255) NOT NULL,
    "name" varchar(255) NOT NULL,
    "description" varchar(255) NOT NULL,
    "kind" varchar(255) NOT NULL,
    "customPrompt" varchar(255) DEFAULT NULL,
    "configuration" jsonb NOT NULL,
    "workspaceId" bigint NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id" bigserial,
    "agentConfigurationId" bigint NOT NULL REFERENCES "agent_configurations" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    "editor" bigint NOT NULL REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX "triggers_workspace_id" ON "triggers" ("workspaceId");

CREATE INDEX "triggers_workspace_id_agent_configuration_id" ON "triggers" ("workspaceId", "agentConfigurationId");


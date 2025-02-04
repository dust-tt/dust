-- Migration created on Jan 27, 2025
CREATE TABLE IF NOT EXISTS "agent_reasoning_configurations" (
    "id" SERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "sId" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "description" TEXT,
    "providerId" VARCHAR(255) NOT NULL,
    "modelId" VARCHAR(255) NOT NULL,
    "temperature" FLOAT,
    "reasoningEffort" VARCHAR(255),
    "agentConfigurationId" INTEGER NOT NULL REFERENCES "agent_configurations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_reasoning_configurations_s_id" ON "agent_reasoning_configurations" ("sId");
CREATE INDEX CONCURRENTLY "agent_reasoning_configurations_agent_configuration_id" ON "agent_reasoning_configurations" ("agentConfigurationId");
CREATE INDEX CONCURRENTLY "agent_reasoning_configurations_workspace_id" ON "agent_reasoning_configurations" ("workspaceId");

CREATE TABLE IF NOT EXISTS "agent_reasoning_actions" (
    "id" SERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "runId" VARCHAR(255),
    "reasoningConfigurationId" VARCHAR(255) NOT NULL,
    "output" TEXT,
    "thinking" TEXT,
    "functionCallId" VARCHAR(255),
    "functionCallName" VARCHAR(255),
    "step" INTEGER NOT NULL,
    "agentMessageId" INTEGER NOT NULL REFERENCES "agent_messages" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY "agent_reasoning_actions_agent_message_id" ON "agent_reasoning_actions" ("agentMessageId");
CREATE INDEX CONCURRENTLY "agent_reasoning_actions_workspace_id" ON "agent_reasoning_actions" ("workspaceId");
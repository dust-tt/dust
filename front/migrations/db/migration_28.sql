-- Migration created on Jul 01, 2024
CREATE TABLE IF NOT EXISTS "agent_visualization_configurations" (
    "id"  SERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "sId" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "description" TEXT,
    "agentConfigurationId" INTEGER NOT NULL REFERENCES "agent_configurations" ("id") ON DELETE CASCADE ON UPDATE CASCADE, 
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_visualization_configurations_s_id" ON "agent_visualization_configurations" ("sId");
CREATE INDEX CONCURRENTLY "agent_visualization_configurations_agent_configuration_id" ON "agent_visualization_configurations" ("agentConfigurationId");

CREATE TABLE IF NOT EXISTS "agent_visualization_actions" (
    "id"  SERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "runId" VARCHAR(255),
    "visualizationConfigurationId" VARCHAR(255) NOT NULL,
    "query" TEXT NOT NULL,
    "output" JSONB,
    "functionCallId" VARCHAR(255),
    "functionCallName" VARCHAR(255),
    "step" INTEGER NOT NULL,
    "agentMessageId" INTEGER NOT NULL REFERENCES "agent_messages" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);
CREATE INDEX CONCURRENTLY "agent_visualization_actions_agent_message_id" ON "agent_visualization_actions" ("agentMessageId");



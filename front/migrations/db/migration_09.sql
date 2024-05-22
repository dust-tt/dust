-- Migration created on May 22, 2024
CREATE TABLE IF NOT EXISTS "agent_browse_configurations" (
    "id" SERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "sId" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "description" TEXT,
    "forceUseAtIteration" INTEGER,
    "agentConfigurationId" INTEGER NOT NULL REFERENCES "agent_configurations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_browse_configurations_s_id" ON "agent_browse_configurations" ("sId");

CREATE TABLE IF NOT EXISTS "agent_browse_actions" (
    "id" SERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "browseConfigurationId" VARCHAR(255) NOT NULL,
    "url" VARCHAR(255) NOT NULL,
    "output" JSONB,
    "functionCallId" VARCHAR(255),
    "functionCallName" VARCHAR(255),
    "step" INTEGER NOT NULL,
    "agentMessageId" INTEGER NOT NULL REFERENCES "agent_messages" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY "agent_browse_actions_agent_message_id" ON "agent_browse_actions" ("agentMessageId");
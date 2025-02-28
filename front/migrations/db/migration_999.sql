-- Migration created on Feb 16, 2025

CREATE TABLE IF NOT EXISTS "agent_mcp_actions" (
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "hostType" VARCHAR(255) NOT NULL,
    "hostUrl" VARCHAR(255),
    "params" JSONB NOT NULL,
    "tokensCount" INTEGER,
    "output" TEXT, "functionCallId" VARCHAR(255), "functionCallName" VARCHAR(255), "step" INTEGER NOT NULL, "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, "id"  BIGSERIAL , "agentMessageId" BIGINT NOT NULL REFERENCES "agent_messages" ("id") ON DELETE NO ACTION ON UPDATE CASCADE, PRIMARY KEY ("id"));
CREATE INDEX CONCURRENTLY "agent_mcp_actions_agent_message_id" ON "agent_mcp_actions" ("agentMessageId");
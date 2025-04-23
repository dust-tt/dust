-- Migration created on Apr 22, 2025

CREATE TABLE "agent_message_compact_checkpoints" (
    "id" BIGSERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "agentMessageId" BIGINT NOT NULL REFERENCES "agent_messages" ("id") ON DELETE RESTRICT,
    "step" INTEGER NOT NULL,
    "usedTokens" INTEGER NOT NULL,
    "availableTokens" INTEGER NOT NULL,
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT
);

CREATE INDEX "agent_message_compact_checkpoints_agent_message_id" ON "agent_message_compact_checkpoints" ("agentMessageId");
CREATE INDEX "agent_message_compact_checkpoints_workspace_id" ON "agent_message_compact_checkpoints" ("workspaceId");
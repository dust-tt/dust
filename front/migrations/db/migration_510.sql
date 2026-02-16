-- Migration created on févr. 16, 2026
CREATE TABLE IF NOT EXISTS "agent_message_citations" (
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "citations" jsonb NOT NULL DEFAULT '{}',
    "generatedFiles" jsonb NOT NULL DEFAULT '[]',
    "workspaceId" bigint NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id" bigserial,
    "agentMessageId" bigint NOT NULL REFERENCES "agent_messages" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX CONCURRENTLY "agent_message_citations_workspace_agent_msg" ON "agent_message_citations" ("workspaceId", "agentMessageId");

CREATE INDEX CONCURRENTLY "agent_message_citations_agent_message_id" ON "agent_message_citations" ("agentMessageId");


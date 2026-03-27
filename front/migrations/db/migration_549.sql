-- Migration created on Mar 27, 2026
CREATE TABLE IF NOT EXISTS "conversation_todo_snapshots"
(
    "createdAt"                  TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                  TIMESTAMP WITH TIME ZONE NOT NULL,
    "conversationId"             BIGINT                   NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "version"                    INTEGER                  NOT NULL DEFAULT 1,
    "runId"                      UUID                     NOT NULL,
    "topic"                      TEXT,
    "actionItems"                JSONB                    NOT NULL DEFAULT '[]',
    "notableFacts"               JSONB                    NOT NULL DEFAULT '[]',
    "keyDecisions"               JSONB                    NOT NULL DEFAULT '[]',
    "agentSuggestions"           JSONB                    NOT NULL DEFAULT '[]',
    "lastRunAt"                  TIMESTAMP WITH TIME ZONE NOT NULL,
    "lastProcessedMessageRank"   INTEGER                  NOT NULL,
    "workspaceId"                BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                         BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX CONCURRENTLY "conversation_todo_snapshots_ws_conv_version_unique_idx" ON "conversation_todo_snapshots" ("workspaceId", "conversationId", "version");
CREATE INDEX CONCURRENTLY "conversation_todo_snapshots_ws_conv_idx" ON "conversation_todo_snapshots" ("workspaceId", "conversationId");
CREATE INDEX CONCURRENTLY "conversation_todo_snapshots_conversationId_idx" ON "conversation_todo_snapshots" ("conversationId");

-- Migration created on Apr 10, 2026

CREATE TABLE IF NOT EXISTS "conversation_forks" (
  "id" BIGSERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "parentConversationId" BIGINT NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "childConversationId" BIGINT NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdByUserId" BIGINT NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "sourceMessageId" BIGINT NOT NULL REFERENCES "messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "branchedAt" TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "conversation_forks_workspace_id_child_conversation_id"
  ON "conversation_forks" ("workspaceId", "childConversationId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "conversation_forks_workspace_id_parent_conversation_id"
  ON "conversation_forks" ("workspaceId", "parentConversationId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "conversation_forks_workspace_id_source_message_id"
  ON "conversation_forks" ("workspaceId", "sourceMessageId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "conversation_forks_parent_conversation_id"
  ON "conversation_forks" ("parentConversationId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "conversation_forks_child_conversation_id"
  ON "conversation_forks" ("childConversationId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "conversation_forks_created_by_user_id"
  ON "conversation_forks" ("createdByUserId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "conversation_forks_source_message_id"
  ON "conversation_forks" ("sourceMessageId");

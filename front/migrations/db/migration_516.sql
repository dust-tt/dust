-- Migration created on Feb 23, 2026
CREATE TABLE IF NOT EXISTS "sandboxes" (
  "id" BIGSERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "conversationId" BIGINT NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "providerId" VARCHAR(255) NOT NULL,
  "status" VARCHAR(255) NOT NULL DEFAULT 'running',
  "lastActivityAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX CONCURRENTLY "sandboxes_workspace_conversation_idx"
  ON "sandboxes" ("workspaceId", "conversationId");

CREATE INDEX CONCURRENTLY "sandboxes_conversation_id_idx"
  ON "sandboxes" ("conversationId");

CREATE INDEX CONCURRENTLY "sandboxes_status_last_activity_idx"
  ON "sandboxes" ("status", "lastActivityAt");

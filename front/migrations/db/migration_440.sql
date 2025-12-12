-- Create pending_mentions table for mention confirmation flow
CREATE TABLE IF NOT EXISTS pending_mentions (
  "id" BIGSERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "workspaceId" BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  "conversationId" BIGINT NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  "messageId" BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  "mentionedUserId" BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  "mentionerUserId" BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  "status" VARCHAR(255) NOT NULL DEFAULT 'pending'
);

-- Create indexes
CREATE INDEX pending_mentions_workspace_id_conversation_id_status_idx
  ON pending_mentions("workspaceId", "conversationId", "status");

CREATE INDEX pending_mentions_workspace_id_message_id_mentioned_user_id_idx
  ON pending_mentions("workspaceId", "messageId", "mentionedUserId");

CREATE INDEX pending_mentions_mentioner_user_id_status_idx
  ON pending_mentions("mentionerUserId", "status");

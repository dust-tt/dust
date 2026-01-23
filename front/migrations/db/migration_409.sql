-- Migration created on Nov 20, 2025
DROP INDEX IF EXISTS "conversation_participants_workspace_id_conversation_id";

-- Table conversation_participants
CREATE INDEX CONCURRENTLY "conversation_participants_workspace_id_conversation_id" ON "conversation_participants" ("workspaceId", "conversationId");

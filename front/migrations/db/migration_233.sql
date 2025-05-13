-- Migration created on May 12, 2025
CREATE UNIQUE INDEX CONCURRENTLY "conversations_workspace_id_s_id" ON "conversations" ("workspaceId", "sId");
CREATE UNIQUE INDEX CONCURRENTLY "conversation_participants_workspace_id_user_id_conversation_id" ON "conversation_participants" ("workspaceId", "userId", "conversationId");
CREATE INDEX CONCURRENTLY "conversation_participants_workspace_id_user_id_action" ON "conversation_participants" ("workspaceId", "userId", "action");

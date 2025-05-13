-- Migration created on May 12, 2025
CREATE INDEX CONCURRENTLY "messages_workspace_id_conversation_id" ON "messages" ("workspaceId", "conversationId");
CREATE INDEX CONCURRENTLY"messages_workspace_id_conversation_id_s_id" ON "messages" ("workspaceId", "conversationId", "sId");

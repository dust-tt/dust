-- Migration created on May 13, 2025
CREATE UNIQUE INDEX CONCURRENTLY "messages_workspace_id_conversation_id_rank_version" ON "messages" ("workspaceId", "conversationId", "rank", "version");

-- Migration created on févr. 02, 2026
CREATE TABLE IF NOT EXISTS "user_conversation_reads" ("lastReadAt" TIMESTAMP WITH TIME ZONE NOT NULL, "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, "id"  BIGSERIAL , "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "conversationId" BIGINT NOT NULL REFERENCES "conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE, "userId" BIGINT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE, PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "user_conversation_reads_workspace_id_user_id_conversation_id" ON "user_conversation_reads" ("workspaceId", "userId", "conversationId");
CREATE INDEX "user_conversation_reads_workspace_id_conversation_id" ON "user_conversation_reads" ("workspaceId", "conversationId");
CREATE INDEX "user_conversation_reads_workspace_id_user_id" ON "user_conversation_reads" ("workspaceId", "userId");

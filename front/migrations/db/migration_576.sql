-- Migration created on Apr 10, 2026
CREATE TABLE IF NOT EXISTS "compaction_messages" ("createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "status" VARCHAR(255) NOT NULL DEFAULT 'created', "content" TEXT, "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, "id"  BIGSERIAL , PRIMARY KEY ("id"));
CREATE INDEX CONCURRENTLY "compaction_messages_workspace_id" ON "compaction_messages" ("workspaceId");
ALTER TABLE "public"."messages" ADD COLUMN "compactionMessageId" BIGINT REFERENCES "compaction_messages" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX CONCURRENTLY "messages_compaction_message_id" ON "messages" ("compactionMessageId");

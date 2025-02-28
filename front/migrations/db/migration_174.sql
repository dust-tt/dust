-- Migration created on Feb 18, 2025
ALTER TABLE "public"."conversations" ADD COLUMN "lastThreadVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."messages" ADD COLUMN "nextThreadVersion" INTEGER;
ALTER TABLE "public"."messages" ADD COLUMN "previousThreadVersion" INTEGER;
ALTER TABLE "public"."messages" ADD COLUMN "threadVersions" INTEGER[] DEFAULT ARRAY[0]::INTEGER[];
CREATE UNIQUE INDEX CONCURRENTLY "messages_conversation_id_rank_version_parent_id" ON "messages" ("conversationId", "rank", "version", "parentId");
CREATE INDEX CONCURRENTLY "messages_conversation_id_rank_parent_id" ON "messages" ("conversationId", "rank", "parentId");
CREATE INDEX CONCURRENTLY "messages_conversation_id_thread_versions" ON "messages" USING GIN ("conversationId", "threadVersions");

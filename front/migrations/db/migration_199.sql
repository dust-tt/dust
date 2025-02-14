-- Migration created on Feb 02, 2025
ALTER TABLE "public"."conversations" ADD COLUMN "currentThreadVersion" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "public"."messages" ADD COLUMN "nextVersionMessageId" BIGINT;
ALTER TABLE "public"."messages" ADD COLUMN "previousVersionMessageId" BIGINT;
ALTER TABLE "public"."messages" ADD COLUMN "threadVersions" BIGINT[] DEFAULT ARRAY[0]::BIGINT[];
CREATE UNIQUE INDEX CONCURRENTLY "messages_conversation_id_rank_version_parent_id" ON "messages" ("conversationId", "rank", "version", "parentId");
DROP INDEX IF EXISTS "messages_conversation_id_rank_version";


-- Migration created on Feb 02, 2025
ALTER TABLE "public"."conversations" ADD COLUMN "currentThreadVersion" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "public"."messages" ADD COLUMN "threadVersions" BIGINT[] DEFAULT ARRAY[0]::BIGINT[];
CREATE UNIQUE INDEX "messages_conversation_id_rank_version_thread_versions[1]" ON "messages" ("conversationId", "rank", "version", "threadVersions[1]");
CREATE UNIQUE INDEX "messages_conversation_id_rank_version_thread_versions[2]" ON "messages" ("conversationId", "rank", "version", "threadVersions[2]");

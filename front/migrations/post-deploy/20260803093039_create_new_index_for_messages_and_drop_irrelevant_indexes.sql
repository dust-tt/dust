SET
  SESSION statement_timeout = 3600000;

SET
  SESSION lock_timeout = 3000;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS messages_workspace_id_conversation_id_rank_version_unique ON public.messages USING btree ("workspaceId", "conversationId", rank, version);

DROP INDEX CONCURRENTLY IF EXISTS "public"."messages_workspace_id_conversation_id_rank_version";

DROP INDEX CONCURRENTLY IF EXISTS "public"."messages_workspace_id_conversation_id_rank_version_branch_id";

DROP INDEX CONCURRENTLY IF EXISTS "public"."messages_workspace_id_conversation_id_rank_version_branch_null";

DROP INDEX CONCURRENTLY IF EXISTS "public"."messages_branch_id";

ALTER TABLE "public"."messages"
DROP COLUMN "branchId";
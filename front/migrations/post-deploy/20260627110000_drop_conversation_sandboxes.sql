-- Drop the legacy conversation-specific sandbox ownership table.
SET lock_timeout = '5s';

DROP TABLE "public"."conversation_sandboxes";

DROP INDEX CONCURRENTLY IF EXISTS "sandboxes_workspace_conversation_idx";
DROP INDEX CONCURRENTLY IF EXISTS "sandboxes_conversation_id_idx";

ALTER TABLE "public"."sandboxes"
  DROP COLUMN "conversationId";

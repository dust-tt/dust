-- Migration created on May 26, 2026
-- Replace the legacy unique index with the non-unique index expected by the model.
DROP INDEX CONCURRENTLY IF EXISTS "conversation_branches_previous_message_id_new";

CREATE INDEX CONCURRENTLY "conversation_branches_previous_message_id_new"
    ON "public"."conversation_branches" ("previousMessageId");

DROP INDEX CONCURRENTLY IF EXISTS "conversation_branches_previous_message_id";

ALTER INDEX "conversation_branches_previous_message_id_new"
RENAME TO "conversation_branches_previous_message_id";

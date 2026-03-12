-- Create a new version of the index without the uniqueness constraint.
CREATE INDEX CONCURRENTLY "conversation_branches_previous_message_id_new" ON "conversation_branches" ("previousMessageId");

-- Drop the old index.
DROP INDEX CONCURRENTLY IF EXISTS "conversation_branches_previous_message_id";

-- Rename the new index to the old index name.
ALTER INDEX conversation_branches_previous_message_id_new
RENAME TO conversation_branches_previous_message_id;

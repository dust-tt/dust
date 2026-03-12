-- Create a new version of the index without the branchId condition and the uniqness so that it can be leveraged by queries not specifying a branchId.
CREATE INDEX CONCURRENTLY "messages_workspace_id_conversation_id_rank_version_new" ON "messages" (
    "workspaceId",
    "conversationId",
    "rank",
    "version"
);

-- Drop the old index.
DROP INDEX CONCURRENTLY IF EXISTS "messages_workspace_id_conversation_id_rank_version";

-- Rename the new index to the old index name.
ALTER INDEX messages_workspace_id_conversation_id_rank_version_new
RENAME TO messages_workspace_id_conversation_id_rank_version;
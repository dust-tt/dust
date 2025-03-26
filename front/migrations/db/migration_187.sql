DROP INDEX CONCURRENTLY "data_sources_workspace_id_conversation_id";

CREATE UNIQUE INDEX CONCURRENTLY "data_sources_workspace_conversation_unique_idx" ON "data_sources" ("workspaceId", "conversationId")
WHERE
    "deletedAt" IS NULL
    AND "conversationId" IS NOT NULL;
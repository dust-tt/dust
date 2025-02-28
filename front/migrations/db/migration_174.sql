CREATE TABLE IF NOT EXISTS "data_source_view_for_conversations" (
    "id" BIGSERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "conversationId" BIGINT NOT NULL REFERENCES "conversations"("id") ON DELETE RESTRICT,
    "dataSourceViewId" BIGINT NOT NULL REFERENCES "data_source_views"("id") ON DELETE RESTRICT,
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "dsv_conversation_unique_idx"
    ON "data_source_view_for_conversations" ("conversationId", "dataSourceViewId");
CREATE INDEX CONCURRENTLY "dsv_conversations_conversation_id_idx"
    ON "data_source_view_for_conversations" ("conversationId");
CREATE INDEX CONCURRENTLY "dsv_conversations_dsv_id_idx"
    ON "data_source_view_for_conversations" ("dataSourceViewId");

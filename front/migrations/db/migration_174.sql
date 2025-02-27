ALTER TABLE "public"."data_source_views" ADD COLUMN "conversationId" INTEGER REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX CONCURRENTLY "data_source_views_workspace_id_conversation_id" ON "data_source_views" ("workspaceId", "conversationId");

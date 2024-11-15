-- Migration created on Nov 14, 2024
ALTER TABLE "public"."data_sources" ADD COLUMN "conversationId" INTEGER REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX CONCURRENTLY "data_sources_workspace_id_conversation_id" ON "data_sources" ("workspaceId", "conversationId");

DROP INDEX IF EXISTS "data_source_views_workspace_id_conversation_id";
ALTER TABLE "public"."data_source_views" DROP COLUMN IF EXISTS "conversationId";

ALTER TABLE "public"."data_source_views"
  ADD COLUMN "conversationId" BIGINT REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX CONCURRENTLY "data_source_views_workspace_id_conversation_id" 
  ON "public"."data_source_views" ("workspaceId", "conversationId");
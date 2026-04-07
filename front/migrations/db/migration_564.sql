-- Migration created on Apr 07, 2026
ALTER TABLE "public"."project_todo_source" ADD COLUMN "conversationTodoItemSId" VARCHAR(255);
CREATE INDEX CONCURRENTLY "project_todo_sources_conv_item_sId_idx"
  ON "public"."project_todo_source" ("sourceConversationId", "conversationTodoItemSId");

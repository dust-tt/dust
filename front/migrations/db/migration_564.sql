-- Migration created on Apr 03, 2026
-- Add conversationTodoVersionedActionItemSId to project_todo_sources to track which
-- ConversationTodoVersioned entry (action item, key decision, notable fact) a
-- ProjectTodo was derived from. Required by the merge-into-project algorithm.

ALTER TABLE "project_todo_sources"
  ADD COLUMN "conversationTodoVersionedActionItemSId" TEXT;

CREATE INDEX CONCURRENTLY "project_todo_sources_ws_conv_todo_sid_idx"
  ON "project_todo_sources" ("workspaceId", "sourceConversationId", "conversationTodoVersionedActionItemSId");

-- Migration created on Apr 09, 2026
ALTER TABLE "public"."project_todo_sources"
    ADD COLUMN "takeawayItemSId" VARCHAR(255);

CREATE INDEX CONCURRENTLY "project_todo_sources_ws_takeaway_item_idx" ON "project_todo_sources" ("workspaceId", "sourceConversationId", "takeawayItemSId");

-- Migration created on Sep 24, 2025
CREATE INDEX CONCURRENTLY "user_messages_workspace_id_date_created_at_user_id_idx" ON "user_messages" ("workspaceId", "DATE(TIMEZONE('UTC', createdAt))", "userId");

DROP INDEX "user_messages_workspace_id_created_at";

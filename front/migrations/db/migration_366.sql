-- Migration created on Sep 23, 2025
CREATE INDEX CONCURRENTLY "user_messages_workspace_id_created_at" ON "user_messages" ("workspaceId", "createdAt");

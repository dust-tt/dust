-- Migration created on Jul 04, 2025
CREATE INDEX CONCURRENTLY "files_workspace_id_user_id" ON "files" ("workspaceId", "userId");

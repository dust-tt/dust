-- Migration created on Sep 22, 2025
CREATE UNIQUE INDEX IF NOT EXISTS "shareable_files_workspace_id_share_scope" ON "shareable_files" ("workspaceId", "shareScope");

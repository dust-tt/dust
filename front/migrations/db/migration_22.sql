-- Migration created on Jun 13, 2024
CREATE INDEX "runs_workspace_id_created_at" ON "runs" ("workspaceId", "createdAt");

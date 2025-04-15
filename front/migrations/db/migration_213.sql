-- Migration created on Apr 15, 2025
CREATE INDEX "groups_workspace_id_kind" ON "groups" ("workspaceId", "kind");

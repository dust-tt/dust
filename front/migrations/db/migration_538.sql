-- Migration created on Mar 09, 2026
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  "skill_configurations_workspace_id_status_is_default"
  ON "skill_configurations" ("workspaceId", "status", "isDefault");

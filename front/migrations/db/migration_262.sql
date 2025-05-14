-- Migration created on May 14, 2025
CREATE INDEX CONCURRENTLY "tracker_configurations_workspace_id_status" ON "tracker_configurations" ("workspaceId", "status");
CREATE INDEX CONCURRENTLY "tracker_configurations_workspace_id_vault_id" ON "tracker_configurations" ("workspaceId", "vaultId");

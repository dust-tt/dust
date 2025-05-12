-- Migration created on May 12, 2025
CREATE INDEX "apps_workspace_id_s_id" ON "apps" ("workspaceId", "sId");
CREATE INDEX "apps_workspace_id_vault_id" ON "apps" ("workspaceId", "vaultId");

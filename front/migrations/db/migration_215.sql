-- Migration created on Apr 17, 2025
CREATE UNIQUE INDEX "mcp_server_views_workspace_remote_mcp_server_vault_active" ON "mcp_server_views" ("workspaceId", "remoteMCPServerId", "vaultId") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "mcp_server_views_workspace_internal_mcp_server_vault_active" ON "mcp_server_views" ("workspaceId", "internalMCPServerId", "vaultId") WHERE "deletedAt" IS NULL;

DROP INDEX "mcp_server_view_workspace_remote_mcp_server_vault_deleted_at_un";
DROP INDEX "mcp_server_view_workspace_internal_mcp_server_vault_deleted_at_";

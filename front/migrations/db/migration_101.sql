-- Migration created on Oct 07, 2024
CREATE UNIQUE INDEX "data_source_view_workspace_data_source_vault_deleted_at_unique" ON "data_source_views" (
    "workspaceId",
    "dataSourceId",
    "vaultId",
    "deletedAt"
);

-- Delete the previous truncated index.
DROP INDEX IF EXISTS "data_source_views_workspace_id_data_source_id_vault_id_deleted_";
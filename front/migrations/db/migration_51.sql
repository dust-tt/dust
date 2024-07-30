-- Migration created on Jul 30, 2024
CREATE INDEX "data_source_views_workspace_id_data_source_id_vault_id" ON "data_source_views" ("workspaceId", "dataSourceId", "vaultId");
ALTER TABLE "public"."agent_data_source_configurations" ADD COLUMN "dataSourceViewId" INTEGER REFERENCES "data_source_views" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

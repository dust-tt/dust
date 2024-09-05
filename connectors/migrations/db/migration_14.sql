-- Migration created on Sep 05, 2024
CREATE UNIQUE INDEX "connectors_workspace_id_data_source_id" ON "connectors" ("workspaceId", "dataSourceId");
ALTER TABLE "connectors" DROP COLUMN "dataSourceName";
ALTER TABLE "connectors" ALTER COLUMN "dataSourceId" SET NOT NULL;
ALTER TABLE "connectors" ALTER COLUMN "dataSourceId" DROP DEFAULT;

-- Migration created on Sep 25, 2024
ALTER TABLE "public"."data_sources"
ADD COLUMN "deletedAt" TIMESTAMP
WITH
  TIME ZONE;

CREATE UNIQUE INDEX CONCURRENTLY "data_sources_workspace_id_name_deleted_at" ON "data_sources" ("workspaceId", "name", "deletedAt");

ALTER TABLE "public"."data_source_views"
ADD COLUMN "deletedAt" TIMESTAMP
WITH
  TIME ZONE;

CREATE UNIQUE INDEX CONCURRENTLY "data_source_views_workspace_id_data_source_id_vault_id_deleted_at" ON "data_source_views" (
  "workspaceId",
  "dataSourceId",
  "vaultId",
  "deletedAt"
);

ALTER TABLE "public"."apps"
ADD COLUMN "deletedAt" TIMESTAMP
WITH
  TIME ZONE;
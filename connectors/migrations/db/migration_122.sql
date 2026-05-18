-- dust_project: track synced GCS mount files (project Files panel) for incremental sync and deletes
CREATE TABLE IF NOT EXISTS "public"."dust_project_mount_files" (
  "id" BIGSERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "connectorId" BIGINT NOT NULL REFERENCES "public"."connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "projectId" VARCHAR(255) NOT NULL,
  "scopedPath" VARCHAR(2048) NOT NULL,
  "documentId" VARCHAR(255) NOT NULL,
  "sourceUpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT "dust_project_mount_files_connector_scoped_path" UNIQUE ("connectorId", "scopedPath")
);

CREATE INDEX IF NOT EXISTS "dust_project_mount_files_connector_id_source_updated_at"
  ON "public"."dust_project_mount_files" ("connectorId", "sourceUpdatedAt");

-- Adds an index to speed up batched scans for Google Drive files
-- Pattern optimized: WHERE "connectorId" = ? AND id > ? ORDER BY id ASC LIMIT ?
-- The composite index enables efficient ordered range scans scoped to a connector.

CREATE INDEX CONCURRENTLY "google_drive_files_connectorId_id_idx"
  ON "public"."google_drive_files" ("connectorId", "id");


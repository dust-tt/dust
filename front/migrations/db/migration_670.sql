-- Migration created on Jun 7, 2026
-- Split authorized_file_access indexes: standalone workspaceId + active shareableFileId rows.
CREATE INDEX CONCURRENTLY "authorized_file_accesses_workspace_id" ON "authorized_file_accesses" ("workspaceId");

CREATE INDEX CONCURRENTLY "authorized_file_accesses_shareable_file_id" ON "authorized_file_accesses" ("shareableFileId");

CREATE INDEX CONCURRENTLY "authorized_file_accesses_shareable_file_id_non_revoked" ON "authorized_file_accesses" ("shareableFileId")
WHERE
    "revokedAt" IS NULL;

DROP INDEX CONCURRENTLY IF EXISTS "authorized_file_accesses_workspace_id_shareable_file_id";
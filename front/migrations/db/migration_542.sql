-- Migration created on Mar 17, 2026
CREATE TABLE
  IF NOT EXISTS "sharing_grants" (
    "createdAt" TIMESTAMP
    WITH
      TIME ZONE NOT NULL,
      "updatedAt" TIMESTAMP
    WITH
      TIME ZONE NOT NULL,
      "email" VARCHAR(255) NOT NULL,
      "grantedAt" TIMESTAMP
    WITH
      TIME ZONE NOT NULL,
      "expiresAt" TIMESTAMP
    WITH
      TIME ZONE DEFAULT NULL,
      "revokedAt" TIMESTAMP
    WITH
      TIME ZONE DEFAULT NULL,
      "lastViewedAt" TIMESTAMP
    WITH
      TIME ZONE DEFAULT NULL,
      "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "id" BIGSERIAL,
      "shareableFileId" BIGINT NOT NULL REFERENCES "shareable_files" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "grantedBy" BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      PRIMARY KEY ("id")
  );

CREATE INDEX "sharing_grants_workspace_id_shareable_file_id" ON "sharing_grants" ("workspaceId", "shareableFileId")
WHERE
  "revokedAt" IS NULL;

CREATE INDEX "sharing_grants_workspace_id_email" ON "sharing_grants" ("workspaceId", "email")
WHERE
  "revokedAt" IS NULL;

CREATE UNIQUE INDEX "sharing_grants_workspace_id_shareable_file_id_email" ON "sharing_grants" ("workspaceId", "shareableFileId", "email")
WHERE
  "revokedAt" IS NULL;
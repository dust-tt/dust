-- Migration created on Jun 5, 2026
-- One row per file a shared Frame may load via useFile(). Active rows have revokedAt = null.
CREATE TABLE
    IF NOT EXISTS "authorized_file_accesses" (
        "createdAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "updatedAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "kind" VARCHAR(255) NOT NULL,
            "ref" VARCHAR(255) NOT NULL,
            "fileName" VARCHAR(255) DEFAULT NULL,
            "legacyPath" VARCHAR(255) DEFAULT NULL,
            "shareScope" VARCHAR(255) NOT NULL,
            "computedByUserId" VARCHAR(255) NOT NULL,
            "frameContentHash" VARCHAR(255) NOT NULL,
            "allowedAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "revokedAt" TIMESTAMP
        WITH
            TIME ZONE DEFAULT NULL,
            "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "id" BIGSERIAL,
            "shareableFileId" BIGINT NOT NULL REFERENCES "shareable_files" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            PRIMARY KEY ("id")
    );

CREATE INDEX "authorized_file_accesses_workspace_id_shareable_file_id" ON "authorized_file_accesses" ("workspaceId", "shareableFileId")
WHERE
    "revokedAt" IS NULL;
-- Migration created on Aug 04, 2025
ALTER TABLE "public"."files"
DROP COLUMN "sharedAt";

CREATE TABLE
    IF NOT EXISTS "shareable_files" (
        "createdAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "updatedAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "token" UUID NOT NULL,
            "shareScope" VARCHAR(255) NOT NULL,
            "sharedAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "expiresAt" TIMESTAMP
        WITH
            TIME ZONE DEFAULT NULL,
            "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "id" BIGSERIAL,
            "fileId" BIGINT NOT NULL REFERENCES "files" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "sharedBy" BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX "shareable_files_workspace_id_file_id" ON "shareable_files" ("workspaceId", "fileId");

CREATE UNIQUE INDEX "shareable_files_token" ON "shareable_files" ("token");
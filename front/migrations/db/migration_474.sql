-- Migration created on Jan 14, 2026
CREATE TABLE IF NOT EXISTS "project_metadata" (
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "status" varchar(50) NOT NULL DEFAULT 'active',
    "description" text DEFAULT NULL,
    "tags" jsonb DEFAULT NULL,
    "externalLinks" jsonb DEFAULT NULL,
    "workspaceId" bigint NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "spaceId" bigint NOT NULL REFERENCES "vaults" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "id" bigserial,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_metadata_space_id_unique" ON "project_metadata" ("spaceId");
CREATE INDEX CONCURRENTLY "project_metadata_workspace_id" ON "project_metadata" ("workspaceId");
CREATE INDEX CONCURRENTLY "project_metadata_status" ON "project_metadata" ("status");

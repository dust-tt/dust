-- Migration created on Feb 26, 2026
CREATE TABLE IF NOT EXISTS "skill_file_attachments" (
    "id" BIGSERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "skillConfigurationId" BIGINT NOT NULL REFERENCES "skill_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "fileId" BIGINT NOT NULL REFERENCES "files" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "fileName" TEXT NOT NULL,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_skill_file_attachment_workspace_skill_config"
    ON "skill_file_attachments" ("workspaceId", "skillConfigurationId");

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "idx_skill_file_attachment_workspace_file"
    ON "skill_file_attachments" ("workspaceId", "fileId");

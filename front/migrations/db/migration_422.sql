CREATE TABLE IF NOT EXISTS "skill_configurations" (
    "id" BIGSERIAL PRIMARY KEY,
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    "version" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(255) NOT NULL DEFAULT 'active',
    "scope" VARCHAR(255) NOT NULL DEFAULT 'private',
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "authorId" BIGINT NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "editorGroupId" BIGINT REFERENCES "groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "requestedSpaceIds" BIGINT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS "skill_configurations_workspace_id" ON "skill_configurations" ("workspaceId");
CREATE INDEX IF NOT EXISTS "skill_configurations_workspace_id_name" ON "skill_configurations" ("workspaceId", "name");
CREATE INDEX IF NOT EXISTS "skill_configurations_workspace_id_status_name" ON "skill_configurations" ("workspaceId", "status", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "skill_configuration_unique_active_name" ON "skill_configurations" ("workspaceId", "name") WHERE "status" = 'active';
CREATE INDEX IF NOT EXISTS "skill_configurations_status" ON "skill_configurations" ("status");

CREATE TABLE IF NOT EXISTS "skill_versions" (
                                                "id" BIGSERIAL PRIMARY KEY,
                                                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                                                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                                                "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "skillConfigurationId" BIGINT NOT NULL REFERENCES "skill_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(255) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "requestedSpaceIds" BIGINT[] NOT NULL,
    "authorId" BIGINT NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "mcpServerConfigurationIds" BIGINT[] NOT NULL
    );

CREATE UNIQUE INDEX IF NOT EXISTS "idx_skill_versions_workspace_configuration_id_version"
    ON "skill_versions" ("workspaceId", "skillConfigurationId", "version");
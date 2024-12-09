-- Migration created on Dec 06, 2024
CREATE TABLE IF NOT EXISTS "tracker_configurations" (
    "id" BIGSERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "deletedAt" TIMESTAMP WITH TIME ZONE,
    "status" VARCHAR(255) NOT NULL DEFAULT 'active',
    "modelId" VARCHAR(255) NOT NULL,
    "providerId" VARCHAR(255) NOT NULL,
    "temperature" FLOAT NOT NULL DEFAULT '0.7',
    "prompt" TEXT,
    "frequency" VARCHAR(255),
    "recipients" VARCHAR(255)[],
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "vaultId" BIGINT NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, "userId" BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, PRIMARY KEY ("id"));
CREATE INDEX "tracker_configurations_workspace_id" ON "tracker_configurations" ("workspaceId");
CREATE TABLE IF NOT EXISTS "tracker_data_source_configurations" (
    "id" BIGSERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "deletedAt" TIMESTAMP WITH TIME ZONE,
    "scope" VARCHAR(255) NOT NULL,
    "parentsIn" VARCHAR(255)[],
    "parentsNotIn" VARCHAR(255)[],
    "trackerConfigurationId" BIGINT NOT NULL REFERENCES "tracker_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "dataSourceId" BIGINT NOT NULL REFERENCES "data_sources" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "dataSourceViewId" BIGINT NOT NULL REFERENCES "data_source_views" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);
CREATE INDEX "tracker_data_source_configurations_tracker_configuration_id" ON "tracker_data_source_configurations" ("trackerConfigurationId");
CREATE TABLE IF NOT EXISTS "tracker_generations" (
    "id" BIGSERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "deletedAt" TIMESTAMP WITH TIME ZONE,
    "content" TEXT NOT NULL,
    "thinking" TEXT,
    "documentId" VARCHAR(255) NOT NULL,
    "trackerConfigurationId" BIGINT NOT NULL REFERENCES "tracker_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "dataSourceId" BIGINT NOT NULL REFERENCES "data_sources" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);
CREATE INDEX "tracker_generations_tracker_configuration_id" ON "tracker_generations" ("trackerConfigurationId");

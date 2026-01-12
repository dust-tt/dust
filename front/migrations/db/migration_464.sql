-- Migration created on Jan 05, 2026
CREATE TABLE IF NOT EXISTS "skill_data_source_configurations" ("createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "skillConfigurationId" BIGINT NOT NULL REFERENCES "skill_configurations" ("id") ON DELETE CASCADE ON UPDATE CASCADE, "dataSourceId" BIGINT NOT NULL REFERENCES "data_sources" ("id") ON DELETE NO ACTION ON UPDATE CASCADE, "dataSourceViewId" BIGINT NOT NULL REFERENCES "data_source_views" ("id") ON DELETE NO ACTION ON UPDATE CASCADE, "parentsIn" VARCHAR(255)[] NOT NULL, "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, "id"  BIGSERIAL , PRIMARY KEY ("id"));

CREATE INDEX "idx_skill_data_source_config_workspace_skill_config" ON "skill_data_source_configurations" ("workspaceId", "skillConfigurationId");
CREATE INDEX "idx_skill_data_source_config_workspace_data_source" ON "skill_data_source_configurations" ("workspaceId", "dataSourceId");
CREATE INDEX "idx_skill_data_source_config_workspace_data_source_view" ON "skill_data_source_configurations" ("workspaceId", "dataSourceViewId");
CREATE INDEX "idx_skill_data_source_config_workspace_skill_data_source_view" ON "skill_data_source_configurations" ("workspaceId", "skillConfigurationId", "dataSourceViewId");

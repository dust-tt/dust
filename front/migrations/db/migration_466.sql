-- Migration created on Jan 06, 2026
DROP INDEX CONCURRENTLY IF EXISTS "group_skills_group_id_skill_configuration_id";
CREATE UNIQUE INDEX CONCURRENTLY "skill_configurations_workspace_id_name_status" ON "skill_configurations" ("workspaceId", "name", "status");
CREATE INDEX CONCURRENTLY "skill_versions_workspace_id_skill_configuration_id" ON "skill_versions" ("workspaceId", "skillConfigurationId");

-- Migration created on June 1, 2026
CREATE INDEX CONCURRENTLY "group_skills_skill_configuration_id" ON "group_skills" ("skillConfigurationId");

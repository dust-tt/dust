/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_default_skills" DROP CONSTRAINT "project_default_skills_projectId_fkey";

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_default_skills" DROP CONSTRAINT "project_default_skills_skillConfigurationId_fkey";

/*
Statement 2
  - INDEX_DROPPED: Dropping this index means queries that use this index might perform worse because they will no longer will be able to leverage it.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY "public"."project_default_skills_skill_configuration_id";

/*
Statement 3
  - INDEX_DROPPED: Dropping this index means queries that use this index might perform worse because they will no longer will be able to leverage it.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY "public"."project_default_skills_unique";

/*
Statement 4
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_default_skills" ADD COLUMN "customSkillId" bigint;

/*
Statement 5
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_default_skills" ADD COLUMN "globalSkillId" character varying(255) COLLATE "pg_catalog"."default";

/*
Statement 6
  - DELETES_DATA: Deletes all values in the column. Safe here: the table is new and not yet used by any released code; every default skill will be re-stored as customSkillId or globalSkillId.
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_default_skills" DROP COLUMN "skillConfigurationId";

/*
Statement 7
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_default_skills" ADD CONSTRAINT "project_default_skills_customSkillId_fkey" FOREIGN KEY ("customSkillId") REFERENCES skill_configurations(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 8
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_default_skills" VALIDATE CONSTRAINT "project_default_skills_customSkillId_fkey";

/*
Statement 9
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_default_skills" ADD CONSTRAINT "project_default_skills_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES project_metadata(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 10
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_default_skills" VALIDATE CONSTRAINT "project_default_skills_projectId_fkey";

/*
Statement 11
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY project_default_skills_custom_skill_id ON public.project_default_skills USING btree ("customSkillId") WHERE ("customSkillId" IS NOT NULL);

/*
Statement 12
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY project_default_skills_custom_skill_unique ON public.project_default_skills USING btree ("workspaceId", "projectId", "customSkillId") WHERE ("customSkillId" IS NOT NULL);

/*
Statement 13
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY project_default_skills_global_skill_unique ON public.project_default_skills USING btree ("workspaceId", "projectId", "globalSkillId") WHERE ("globalSkillId" IS NOT NULL);

/*
Statement 14
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY project_default_skills_workspace_id_project_id ON public.project_default_skills USING btree ("workspaceId", "projectId");

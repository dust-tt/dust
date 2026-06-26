/*
Add the pod default-skill sId array to project_metadata. Nullable, no default data: the pods default-skills feature is not yet
released, so there is nothing to backfill.

Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_metadata" ADD COLUMN "defaultSkillsIds" character varying(255)[] DEFAULT NULL::character varying[];

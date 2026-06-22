-- Migration created on Jun 17, 2026
ALTER TABLE "public"."project_metadata" ADD COLUMN "defaultSkillSIds" VARCHAR(255)[] DEFAULT NULL;

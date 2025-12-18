-- Migration created on Dec 18, 2025
ALTER TABLE "public"."skill_configurations" ADD COLUMN "extendedSkillId" TEXT;
ALTER TABLE "public"."skill_versions" ADD COLUMN "extendedSkillId" TEXT;

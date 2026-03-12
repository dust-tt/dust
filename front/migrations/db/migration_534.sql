-- Migration created on Mar 06, 2026
ALTER TABLE "skill_configurations" ADD COLUMN "isDefault" BOOLEAN DEFAULT false;
ALTER TABLE "skill_versions" ADD COLUMN "isDefault" BOOLEAN DEFAULT false;

-- Migration created on Mar 06, 2026
ALTER TABLE "skill_configurations" ADD COLUMN "isDiscoverable" BOOLEAN DEFAULT false;
ALTER TABLE "skill_versions" ADD COLUMN "isDiscoverable" BOOLEAN DEFAULT false;

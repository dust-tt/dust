-- Migration created on Apr 09, 2026

ALTER TABLE "skill_configurations" ADD COLUMN "instructionsHtml" TEXT;
ALTER TABLE "skill_versions" ADD COLUMN "instructionsHtml" TEXT;

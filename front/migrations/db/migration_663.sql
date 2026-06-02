-- Migration created on Jun 02, 2026
ALTER TABLE "skill_configurations"
ADD COLUMN "visibility" VARCHAR(32) NOT NULL DEFAULT 'published',
ADD CONSTRAINT "skill_configurations_visibility_check"
  CHECK ("visibility" IN ('unpublished', 'published', 'discoverable'));

UPDATE "skill_configurations"
SET "visibility" = 'discoverable'
WHERE "isDefault" = TRUE;

ALTER TABLE "skill_versions"
ADD COLUMN "visibility" VARCHAR(32) NOT NULL DEFAULT 'published',
ADD CONSTRAINT "skill_versions_visibility_check"
  CHECK ("visibility" IN ('unpublished', 'published', 'discoverable'));

UPDATE "skill_versions"
SET "visibility" = 'discoverable'
WHERE "isDefault" = TRUE;

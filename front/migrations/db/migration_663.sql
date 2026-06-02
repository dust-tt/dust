-- Migration created on Jun 02, 2026
ALTER TABLE "skill_configurations"
ADD COLUMN "visibility" VARCHAR(32) NOT NULL DEFAULT 'published';

UPDATE "skill_configurations"
SET "visibility" = 'discoverable'
WHERE "isDefault" = TRUE;

ALTER TABLE "skill_versions"
ADD COLUMN "visibility" VARCHAR(32) NOT NULL DEFAULT 'published';

UPDATE "skill_versions"
SET "visibility" = 'discoverable'
WHERE "isDefault" = TRUE;

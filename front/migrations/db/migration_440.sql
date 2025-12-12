-- Migration created on Dec 12, 2024
ALTER TABLE "skill_configuration"
    ADD COLUMN "icon" TEXT;

ALTER TABLE "skill_versions"
    ADD COLUMN "icon" TEXT;

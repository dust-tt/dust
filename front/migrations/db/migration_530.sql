-- Backfill source to 'web_app' for existing skill_configurations and skill_versions.
UPDATE "skill_configurations" SET "source" = 'web_app' WHERE "source" IS NULL;
UPDATE "skill_versions" SET "source" = 'web_app' WHERE "source" IS NULL;

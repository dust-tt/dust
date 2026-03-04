ALTER TABLE "skill_configurations"
  ADD COLUMN "source" VARCHAR(255),
  ADD COLUMN "sourceMetadata" JSONB;

ALTER TABLE "skill_versions"
  ADD COLUMN "source" VARCHAR(255),
  ADD COLUMN "sourceMetadata" JSONB;

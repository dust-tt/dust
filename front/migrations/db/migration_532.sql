ALTER TABLE "skill_versions"
ADD COLUMN "fileAttachmentIds" BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[];

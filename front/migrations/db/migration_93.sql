-- Migration created on Sep 26, 2024
ALTER TABLE "labs_transcripts_histories" ADD COLUMN "userId" INTEGER;

UPDATE "labs_transcripts_histories"
SET "userId" = "labs_transcripts_configurations"."userId"
FROM "labs_transcripts_configurations"
WHERE "labs_transcripts_histories"."configurationId" = "labs_transcripts_configurations"."id";

ALTER TABLE "labs_transcripts_histories" ALTER COLUMN "userId" SET NOT NULL;

DROP INDEX IF EXISTS "labs_transcripts_histories_file_id";
DROP INDEX IF EXISTS "labs_transcripts_histories_file_id_user_id";
CREATE UNIQUE INDEX "labs_transcripts_histories_file_id_user_id" ON "labs_transcripts_histories" ("fileId", "userId");


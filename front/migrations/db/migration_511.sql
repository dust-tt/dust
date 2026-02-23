-- Migration created on Feb 16, 2026
-- Add sId columns to academy tables ([BACK10] Resource invariant)
ALTER TABLE "academy_quiz_attempts" ADD COLUMN IF NOT EXISTS "sId" VARCHAR(255);
ALTER TABLE "academy_chapter_visits" ADD COLUMN IF NOT EXISTS "sId" VARCHAR(255);

-- Backfill existing rows with random sIds
UPDATE "academy_quiz_attempts" SET "sId" = 'aqz_' || substr(md5(random()::text), 1, 10) WHERE "sId" IS NULL;
UPDATE "academy_chapter_visits" SET "sId" = 'acv_' || substr(md5(random()::text), 1, 10) WHERE "sId" IS NULL;

-- Now make the columns NOT NULL
ALTER TABLE "academy_quiz_attempts" ALTER COLUMN "sId" SET NOT NULL;
ALTER TABLE "academy_chapter_visits" ALTER COLUMN "sId" SET NOT NULL;

-- Migration created on Apr 21, 2026
DELETE FROM "wake_ups" WHERE "userId" IS NULL;
ALTER TABLE "wake_ups" ALTER COLUMN "userId" SET NOT NULL;

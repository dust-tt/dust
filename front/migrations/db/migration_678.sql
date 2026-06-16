-- Migration created on Jun 11, 2026
ALTER TABLE "public"."plans"
ADD COLUMN "isBrandedFramesAllowed" BOOLEAN DEFAULT false;
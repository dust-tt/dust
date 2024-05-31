-- Migration created on May 31, 2024
ALTER TABLE "public"."templates" ADD COLUMN "timeFrameDuration" INTEGER;
ALTER TABLE "public"."templates" ADD COLUMN "timeFrameUnit" VARCHAR(255);

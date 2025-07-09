-- Migration created on Apr 24, 2025
ALTER TABLE "public"."plans" ADD COLUMN "maxImagesPerWeek" INTEGER NOT NULL DEFAULT 0;

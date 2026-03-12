-- Migration created on Feb 24, 2026
ALTER TABLE "public"."gong_configurations" ADD COLUMN "excludeTitleKeywords" VARCHAR(255)[];

-- Migration created on Jun 19, 2025
ALTER TABLE "public"."webcrawler_configurations" ADD COLUMN "crawlId" VARCHAR(64) DEFAULT NULL;

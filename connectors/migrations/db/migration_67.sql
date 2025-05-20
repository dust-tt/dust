-- Migration created on Apr 24, 2025
ALTER TABLE "public"."webcrawler_configurations" ADD COLUMN "customCrawler" VARCHAR(128) DEFAULT NULL;

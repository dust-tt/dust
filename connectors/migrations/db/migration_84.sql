-- Migration created on Jul 11, 2025
ALTER TABLE "public"."webcrawler_configurations" ADD COLUMN "actions" JSON DEFAULT NULL;

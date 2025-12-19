-- Migration created on Dec 19, 2025
-- Backfill urlMd5, add constraints, set NOT NULL

-- Backfill urlMd5 for webcrawler_pages
UPDATE "webcrawler_pages" SET "urlMd5" = md5("url") WHERE "urlMd5" IS NULL;
ALTER TABLE "webcrawler_pages" ALTER COLUMN "urlMd5" SET NOT NULL;

-- Add new constraint, drop old constraint for webcrawler_pages
ALTER TABLE "webcrawler_pages"
  ADD CONSTRAINT "webcrawler_pages_url_md5_connector_id_webcrawler_configuration_id"
  UNIQUE ("urlMd5", "connectorId", "webcrawlerConfigurationId");

ALTER TABLE "webcrawler_pages" DROP CONSTRAINT IF EXISTS "webcrawler_pages_url_connector_id_webcrawler_configuration_id";

-- Backfill urlMd5 for webcrawler_folders
UPDATE "webcrawler_folders" SET "urlMd5" = md5("url") WHERE "urlMd5" IS NULL;
ALTER TABLE "webcrawler_folders" ALTER COLUMN "urlMd5" SET NOT NULL;

-- Add new constraint, drop old constraint for webcrawler_folders
ALTER TABLE "webcrawler_folders"
  ADD CONSTRAINT "webcrawler_folders_url_md5_connector_id_webcrawler_configuration_id"
  UNIQUE ("urlMd5", "connectorId", "webcrawlerConfigurationId");

ALTER TABLE "webcrawler_folders" DROP CONSTRAINT IF EXISTS "webcrawler_folders_url_connector_id_webcrawler_configuration_id";

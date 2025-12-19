-- Migration created on Dec 19, 2025
-- Drop indexes from migration_110, add urlMd5 columns (nullable for now)

-- Drop the md5-based indexes created in migration_110
DROP INDEX CONCURRENTLY IF EXISTS "webcrawler_pages_url_md5_connector_id_webcrawler_configuration_id";
DROP INDEX CONCURRENTLY IF EXISTS "webcrawler_folders_url_md5_connector_id_webcrawler_configuration_id";

-- Add urlMd5 columns (nullable)
ALTER TABLE "webcrawler_pages" ADD COLUMN "urlMd5" VARCHAR(32);
ALTER TABLE "webcrawler_folders" ADD COLUMN "urlMd5" VARCHAR(32);

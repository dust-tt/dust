-- Migration created on Dec 19, 2025
-- Replace URL-based indexes with MD5(url)-based indexes to handle long URLs

-- webcrawler_pages: create new MD5 index, drop old index
CREATE UNIQUE INDEX CONCURRENTLY "webcrawler_pages_url_md5_connector_id_webcrawler_configuration_id"
  ON "webcrawler_pages" (md5("url"), "connectorId", "webcrawlerConfigurationId");

DROP INDEX CONCURRENTLY IF EXISTS "webcrawler_pages_url_connector_id_webcrawler_configuration_id";

-- webcrawler_folders: create new MD5 index, drop old index
CREATE UNIQUE INDEX CONCURRENTLY "webcrawler_folders_url_md5_connector_id_webcrawler_configuration_id"
  ON "webcrawler_folders" (md5("url"), "connectorId", "webcrawlerConfigurationId");

DROP INDEX CONCURRENTLY IF EXISTS "webcrawler_folders_url_connector_id_webcrawler_configuration_id";

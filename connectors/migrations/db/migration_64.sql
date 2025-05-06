-- Migration created on Apr 10, 2025
CREATE INDEX CONCURRENTLY "notion_pages_connector_id" ON "notion_pages" ("connectorId");
CREATE INDEX CONCURRENTLY "notion_databases_connector_id" ON "notion_databases" ("connectorId");

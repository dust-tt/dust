-- Migration created on Jul 30, 2024
CREATE INDEX CONCURRENTLY "notion_databases_connector_id_last_seen_ts" ON "notion_databases" ("connectorId", "lastSeenTs");
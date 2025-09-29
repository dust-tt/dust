-- Migration created on Sep 29, 2025
CREATE INDEX CONCURRENTLY "notion_connector_block_cache_entries_connector_page_workflow" ON "notion_connector_block_cache_entries" ("connectorId", "notionPageId", "workflowId");

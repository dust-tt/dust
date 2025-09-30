-- Migration created on Sep 29, 2025
CREATE INDEX CONCURRENTLY "notion_connector_block_cache_entries_connector_page_workflow" ON "notion_connector_block_cache_entries" ("connectorId", "notionPageId", "workflowId");
DROP INDEX CONCURRENTLY "notion_connector_block_cache_entries_notion_page_id";
DROP INDEX CONCURRENTLY "notion_connector_block_cache_entries_parent_block_id";
DROP INDEX CONCURRENTLY "notion_connector_block_cache_entries_workflow_id";

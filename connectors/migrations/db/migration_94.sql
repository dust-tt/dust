-- Migration created on Sep 29, 2025
CREATE INDEX "notion_connector_block_cache_entries_connector_id_workflow_id" ON "notion_connector_block_cache_entries" ("connectorId", "workflowId");
[09:11:49.442] [32mINFO[39m (94930): [36mDone[39m;

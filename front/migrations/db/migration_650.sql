-- Migration created on May 22, 2026
CREATE INDEX CONCURRENTLY "content_fragments_node_dsv_id_workspace_id" ON "content_fragments" ("nodeDataSourceViewId", "workspaceId");

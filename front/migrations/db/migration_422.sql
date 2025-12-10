-- Migration created on Dec 03, 2025
CREATE INDEX CONCURRENTLY "plugin_runs_workspace_id_resource_type_resource_id_created_at" ON "plugin_runs" ("workspaceId", "resourceType", "resourceId", "createdAt");

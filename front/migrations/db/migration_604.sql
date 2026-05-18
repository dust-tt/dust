-- Migration created on Apr 27, 2026
CREATE INDEX CONCURRENTLY "remote_mcp_server_workspace_id_id" ON "remote_mcp_servers" ("workspaceId", "id");

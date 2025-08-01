-- Migration created on Aug 01, 2025
CREATE UNIQUE INDEX "remote_mcp_server_workspace_name" ON "remote_mcp_servers" ("workspaceId", "name");

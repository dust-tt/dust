-- Migration created on Oct 27, 2025
CREATE INDEX CONCURRENTLY "mcp_server_connections_workspace_id_connection_type_user_id" ON "mcp_server_connections" ("workspaceId", "connectionType", "userId");
CREATE INDEX CONCURRENTLY "idx_workspace_server_remote" ON "mcp_server_connections" ("workspaceId", "serverType", "remoteMCPServerId");
CREATE INDEX CONCURRENTLY "idx_workspace_server_internal" ON "mcp_server_connections" ("workspaceId", "serverType", "internalMCPServerId");

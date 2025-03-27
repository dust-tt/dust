-- Migration created on Mar 25, 2025
CREATE TABLE IF NOT EXISTS "mcp_server_connections" (
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, 
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, 
    "connectionId" VARCHAR(255) NOT NULL, 
    "connectionType" VARCHAR(255) NOT NULL, 
    "serverType" VARCHAR(255) NOT NULL, 
    "internalMCPServerId" VARCHAR(255),
    "remoteMCPServerId" BIGINT REFERENCES "remote_mcp_servers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, 
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, "id"  BIGSERIAL , 
    "userId" BIGINT NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY "mcp_server_connections_workspace_id_internal_m_c_p_server_id" ON "mcp_server_connections" ("workspaceId", "internalMCPServerId");

CREATE INDEX CONCURRENTLY "mcp_server_connections_workspace_id_remote_m_c_p_server_id" ON "mcp_server_connections" ("workspaceId", "remoteMCPServerId");


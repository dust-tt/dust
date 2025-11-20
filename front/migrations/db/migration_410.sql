CREATE TABLE IF NOT EXISTS "internal_mcp_server_credentials" (
    "id" BIGSERIAL PRIMARY KEY,
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "internalMCPServerId" VARCHAR(255) NOT NULL,
    "sharedSecret" TEXT,
    "customHeaders" JSONB,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "mcp_credential_serverid_uniq" ON "internal_mcp_server_credentials" ("workspaceId", "internalMCPServerId");
CREATE INDEX IF NOT EXISTS "internal_mcp_server_credentials_workspace_id" ON "internal_mcp_server_credentials" ("workspaceId");

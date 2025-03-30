-- Migration created on Mar 30, 2025
CREATE TABLE
    IF NOT EXISTS "mcp_server_views" (
        "createdAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "deletedAt" TIMESTAMP
        WITH
            TIME ZONE,
            "editedAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "serverType" VARCHAR(255) NOT NULL,
            "internalMCPServerId" VARCHAR(255),
            "remoteMCPServerId" BIGINT REFERENCES "remote_mcp_servers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "updatedAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "id" BIGSERIAL,
            "vaultId" BIGINT NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "editedByUserId" BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
            PRIMARY KEY ("id")
    );

CREATE INDEX "mcp_server_views_workspace_id_id" ON "mcp_server_views" ("workspaceId", "id");

CREATE INDEX "mcp_server_views_workspace_id_vault_id" ON "mcp_server_views" ("workspaceId", "vaultId");

CREATE UNIQUE INDEX "mcp_server_view_workspace_remote_mcp_server_vault_deleted_at_unique" ON "mcp_server_views" (
    "workspaceId",
    "remoteMCPServerId",
    "vaultId",
    "deletedAt"
);

CREATE UNIQUE INDEX "mcp_server_view_workspace_internal_mcp_server_vault_deleted_at_unique" ON "mcp_server_views" (
    "workspaceId",
    "internalMCPServerId",
    "vaultId",
    "deletedAt"
);

TRUNCATE TABLE "agent_mcp_server_configurations" CASCADE;

ALTER TABLE "public"."agent_mcp_server_configurations"
ADD COLUMN "mcpServerViewId" BIGINT NOT NULL REFERENCES "mcp_server_views" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
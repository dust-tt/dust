-- Migration created on Aug 01, 2025
CREATE UNIQUE INDEX "remote_mcp_server_workspace_name" ON "remote_mcp_servers" ("workspaceId", "name");

ALTER TABLE "public"."mcp_server_views"
ADD COLUMN "name" VARCHAR(255);

ALTER TABLE "public"."mcp_server_views"
ADD COLUMN "description" VARCHAR(255);

CREATE UNIQUE INDEX "mcp_server_views_workspace_name_vault_active" ON "mcp_server_views" ("workspaceId", "name", "vaultId")
WHERE
    "deletedAt" IS NULL;
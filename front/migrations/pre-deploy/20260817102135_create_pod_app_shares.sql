CREATE TABLE "pod_app_shares" (
  "id" BIGSERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "deletedAt" TIMESTAMP WITH TIME ZONE,
  "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "spaceId" BIGINT NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "appPrefix" VARCHAR(255) NOT NULL,
  "internalMCPServerId" VARCHAR(255) NOT NULL,
  "sharedByUserId" BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "toolsetName" VARCHAR(255) NOT NULL,
  "description" TEXT NOT NULL
);

CREATE UNIQUE INDEX "pod_app_shares_workspace_space_app_prefix_active" ON "pod_app_shares"
  ("workspaceId", "spaceId", "appPrefix") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "pod_app_shares_workspace_internal_mcp_server_active" ON "pod_app_shares"
  ("workspaceId", "internalMCPServerId") WHERE "deletedAt" IS NULL;
CREATE INDEX "pod_app_shares_space_id" ON "pod_app_shares" ("spaceId");

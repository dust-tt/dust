-- Migration created on Sep 08, 2025
CREATE TABLE IF NOT EXISTS "webhook_sources_views" (
    "createdAt" timestamp WITH time zone NOT NULL,
    "updatedAt" timestamp WITH time zone NOT NULL,
    "deletedAt" timestamp WITH time zone,
    "editedAt" timestamp WITH time zone NOT NULL,
    "customName" varchar(255),
    "webhookSourceId" bigint NOT NULL REFERENCES "webhook_sources" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId" bigint NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id" bigserial,
    "vaultId" bigint NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "editedByUserId" bigint REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX "webhook_sources_views_workspace_id_vault_id" ON "webhook_sources_views" ("workspaceId", "vaultId");

CREATE UNIQUE INDEX "webhook_sources_views_workspace_vault_webhook_source_active" ON "webhook_sources_views" ("workspaceId", "vaultId", "webhookSourceId")
WHERE
    "deletedAt" IS NULL;

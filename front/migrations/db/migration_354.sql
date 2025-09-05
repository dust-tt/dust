-- Migration created on Sep 05, 2025
CREATE TABLE IF NOT EXISTS "webhook_sources" (
    "createdAt" timestamp WITH time zone NOT NULL,
    "updatedAt" timestamp WITH time zone NOT NULL,
    "name" varchar(255) NOT NULL,
    "secret" text,
    "signatureHeader" varchar(255),
    "signatureAlgorithm" varchar(255),
    "customHeaders" jsonb,
    "workspaceId" bigint NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id" bigserial,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_sources_workspace_id_name" ON "webhook_sources" ("workspaceId", "name");

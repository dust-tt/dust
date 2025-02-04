-- Migration created on Dec 30, 2024
CREATE TABLE IF NOT EXISTS "extension_configurations" (
    "id"  BIGSERIAL ,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "blacklistedDomains" VARCHAR(255)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(255)[],
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "extension_configurations_workspace_id" ON "extension_configurations" ("workspaceId");

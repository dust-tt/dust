-- Migration created on Mar 09, 2026
CREATE TABLE IF NOT EXISTS "provider_credentials" (
    "id" BIGSERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "providerId" VARCHAR(255) NOT NULL,
    "credentialId" VARCHAR(255) NOT NULL,
    "placeholder" VARCHAR(255) NOT NULL,
    "isHealthy" BOOLEAN NOT NULL,
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "editedByUserId" BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "provider_credentials_workspace_id_provider_id" ON "provider_credentials" ("workspaceId", "providerId");

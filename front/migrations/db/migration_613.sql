-- Migration created on Apr 29, 2026

CREATE TABLE IF NOT EXISTS "workspace_sandbox_env_vars" (
  "id" BIGSERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" VARCHAR(255) NOT NULL,
  "encryptedValue" TEXT NOT NULL,
  "createdByUserId" BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "lastUpdatedByUserId" BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "workspace_sandbox_env_vars_workspace_name_idx"
  ON "workspace_sandbox_env_vars" ("workspaceId", "name");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "workspace_sandbox_env_vars_workspace_id_idx"
  ON "workspace_sandbox_env_vars" ("workspaceId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "workspace_sandbox_env_vars_created_by_user_id_idx"
  ON "workspace_sandbox_env_vars" ("createdByUserId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "workspace_sandbox_env_vars_last_updated_by_user_id_idx"
  ON "workspace_sandbox_env_vars" ("lastUpdatedByUserId");

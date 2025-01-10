-- Migration created on Oct 07, 2024
ALTER TABLE "public"."vaults"
ADD COLUMN "deletedAt" TIMESTAMP
WITH
  TIME ZONE;

CREATE UNIQUE INDEX "vaults_workspace_id_name_deleted_at" ON "vaults" ("workspaceId", "name", "deletedAt");

DROP INDEX IF EXISTS vaults_workspace_id_name;
-- Migration created on May 28, 2024
CREATE TABLE IF NOT EXISTS "workspace_metadata" ("id"  SERIAL , "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "lastCancelAt" TIMESTAMP WITH TIME ZONE, "lastReupgradeAt" TIMESTAMP WITH TIME ZONE, "workspaceId" INTEGER NOT NULL REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE, PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "workspace_metadata_workspace_id" ON "workspace_metadata" ("workspaceId");

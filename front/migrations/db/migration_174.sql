-- Migration created on Mar 04, 2025
CREATE TABLE
  IF NOT EXISTS "plugin_runs" (
    "args" VARCHAR(255),
    "author" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP
    WITH
      TIME ZONE NOT NULL,
      "updatedAt" TIMESTAMP
    WITH
      TIME ZONE NOT NULL,
      "pluginId" VARCHAR(255) NOT NULL,
      "result" VARCHAR(4096),
      "status" VARCHAR(255) NOT NULL,
      "error" VARCHAR(4096),
      "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "id" BIGSERIAL,
      PRIMARY KEY ("id")
  );

CREATE INDEX "plugin_runs_workspace_id" ON "plugin_runs" ("workspaceId");
CREATE INDEX "plugin_runs_resource_type_resource_id" ON "plugin_runs" ("resourceType", "resourceId");
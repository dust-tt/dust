CREATE TABLE "file_system_nodes" (
  "id" BIGSERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  "parentId" BIGINT REFERENCES "file_system_nodes" ("id") ON DELETE CASCADE,
  "rootKind" VARCHAR(255) NOT NULL,
  "rootId" VARCHAR(255) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "kind" VARCHAR(255) NOT NULL,
  "mode" INTEGER NOT NULL,
  "size" BIGINT NOT NULL DEFAULT 0,
  "contentType" VARCHAR(255),
  "blobId" VARCHAR(255),
  "contentRevision" INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX "file_system_nodes_parent_name_idx" ON "file_system_nodes"
  ("workspaceId", "parentId", "name") WHERE "parentId" IS NOT NULL;
CREATE UNIQUE INDEX "file_system_nodes_root_idx" ON "file_system_nodes"
  ("workspaceId", "rootKind", "rootId") WHERE "parentId" IS NULL;
CREATE INDEX "file_system_nodes_parent_id_idx" ON "file_system_nodes" ("parentId");
CREATE INDEX "file_system_nodes_workspace_id_idx" ON "file_system_nodes" ("workspaceId", "id");

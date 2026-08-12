CREATE TABLE "file_system_nodes" (
  "id" SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "workspaceId" INTEGER NOT NULL REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  "parentId" INTEGER REFERENCES "file_system_nodes" ("id") ON DELETE CASCADE,
  "rootKind" VARCHAR(255) NOT NULL,
  "rootId" VARCHAR(255) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "kind" VARCHAR(255) NOT NULL,
  "mode" INTEGER NOT NULL,
  "size" BIGINT NOT NULL DEFAULT 0,
  "contentType" VARCHAR(255),
  "blobId" VARCHAR(255),
  "contentRevision" INTEGER NOT NULL DEFAULT 0,
  "fileId" INTEGER REFERENCES "files" ("id") ON DELETE SET NULL,
  "pendingMutationId" INTEGER
);

CREATE UNIQUE INDEX "file_system_nodes_child_name" ON "file_system_nodes"
  ("workspaceId", "parentId", "name") WHERE "parentId" IS NOT NULL;
CREATE UNIQUE INDEX "file_system_nodes_root" ON "file_system_nodes"
  ("workspaceId", "rootKind", "rootId") WHERE "parentId" IS NULL;
CREATE UNIQUE INDEX "file_system_nodes_file" ON "file_system_nodes"
  ("workspaceId", "fileId") WHERE "fileId" IS NOT NULL;
CREATE INDEX "file_system_nodes_scope" ON "file_system_nodes"
  ("workspaceId", "rootKind", "rootId");
CREATE INDEX "file_system_nodes_pending_mutation" ON "file_system_nodes"
  ("workspaceId", "pendingMutationId");

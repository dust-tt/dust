CREATE TABLE "file_system_mutations" (
  "id" SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "workspaceId" INTEGER NOT NULL REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  "requestId" VARCHAR(255) NOT NULL,
  "kind" VARCHAR(255) NOT NULL,
  "state" VARCHAR(255) NOT NULL,
  "nodeId" INTEGER NOT NULL,
  "sourceRootKind" VARCHAR(255) NOT NULL,
  "sourceRootId" VARCHAR(255) NOT NULL,
  "sourceParentId" INTEGER NOT NULL,
  "sourceName" VARCHAR(255) NOT NULL,
  "destinationRootKind" VARCHAR(255),
  "destinationRootId" VARCHAR(255),
  "destinationParentId" INTEGER,
  "destinationName" VARCHAR(255),
  "replacedNodeId" INTEGER,
  "sourceBlobId" VARCHAR(255),
  "replacedBlobId" VARCHAR(255),
  "removedFileResourceId" VARCHAR(255),
  "result" JSONB
);

CREATE UNIQUE INDEX "file_system_mutations_request" ON "file_system_mutations"
  ("workspaceId", "requestId");
CREATE INDEX "file_system_mutations_repair" ON "file_system_mutations"
  ("workspaceId", "state", "updatedAt");

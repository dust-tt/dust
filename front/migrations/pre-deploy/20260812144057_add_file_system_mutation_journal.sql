CREATE TABLE "file_system_mutations" (
  "id" BIGSERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  "completedAt" TIMESTAMP WITH TIME ZONE,
  "requestId" VARCHAR(255) NOT NULL,
  "kind" VARCHAR(255) NOT NULL,
  "state" VARCHAR(255) NOT NULL,
  "nodeId" BIGINT NOT NULL,
  "nodeKind" VARCHAR(255) NOT NULL,
  "sourceRootKind" VARCHAR(255) NOT NULL,
  "sourceRootId" VARCHAR(255) NOT NULL,
  "sourceParentId" BIGINT NOT NULL,
  "sourceName" VARCHAR(255) NOT NULL,
  "sourceRelativePath" VARCHAR(255) NOT NULL,
  "destinationRootKind" VARCHAR(255),
  "destinationRootId" VARCHAR(255),
  "destinationParentId" BIGINT,
  "destinationName" VARCHAR(255),
  "destinationRelativePath" VARCHAR(255),
  "replacedNodeId" BIGINT,
  "sourceBlobId" VARCHAR(255),
  "replacedBlobId" VARCHAR(255),
  "removedFileResourceId" VARCHAR(255),
  "lastError" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX "file_system_mutations_request_idx" ON "file_system_mutations"
  ("workspaceId", "requestId");
CREATE INDEX "file_system_mutations_state_idx" ON "file_system_mutations"
  ("state", "updatedAt");
CREATE INDEX "file_system_mutations_node_idx" ON "file_system_mutations"
  ("workspaceId", "nodeId");
CREATE INDEX "file_system_mutations_completed_idx" ON "file_system_mutations"
  ("workspaceId", "state", "completedAt");

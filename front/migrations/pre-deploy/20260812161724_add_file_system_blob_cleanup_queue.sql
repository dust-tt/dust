CREATE TABLE "file_system_blob_cleanups" (
  "id" BIGSERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "nodeId" BIGINT NOT NULL,
  "blobId" VARCHAR(255) NOT NULL,
  "notBefore" TIMESTAMP WITH TIME ZONE NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT
);

CREATE UNIQUE INDEX "file_system_blob_cleanups_blob_idx" ON "file_system_blob_cleanups"
  ("workspaceId", "nodeId", "blobId");
CREATE INDEX "file_system_blob_cleanups_pending_idx" ON "file_system_blob_cleanups"
  ("notBefore");

CREATE TABLE "file_system_blob_cleanups" (
  "id" SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "workspaceId" INTEGER NOT NULL REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  "nodeId" INTEGER NOT NULL,
  "blobId" VARCHAR(255) NOT NULL,
  "notBefore" TIMESTAMP WITH TIME ZONE NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" VARCHAR(255)
);

CREATE UNIQUE INDEX "file_system_blob_cleanups_blob" ON "file_system_blob_cleanups"
  ("workspaceId", "nodeId", "blobId");
CREATE INDEX "file_system_blob_cleanups_due" ON "file_system_blob_cleanups"
  ("notBefore", "id");
CREATE INDEX "file_system_blob_cleanups_workspace_due" ON "file_system_blob_cleanups"
  ("workspaceId", "notBefore", "id");

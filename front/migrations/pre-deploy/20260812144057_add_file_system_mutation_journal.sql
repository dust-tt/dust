CREATE TABLE "file_system_mutations" (
  "id" BIGSERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "completedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "requestId" VARCHAR(255) NOT NULL,
  "kind" VARCHAR(255) NOT NULL,
  "response" JSONB NOT NULL
);

CREATE UNIQUE INDEX "file_system_mutations_request_idx" ON "file_system_mutations"
  ("workspaceId", "requestId");
CREATE INDEX "file_system_mutations_completed_idx" ON "file_system_mutations"
  ("workspaceId", "completedAt");

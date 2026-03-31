-- Migration created on Mar 31, 2026
CREATE TABLE IF NOT EXISTS "project_todo_state"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "lastReadAt"  TIMESTAMP WITH TIME ZONE NOT NULL,
    "spaceId"     BIGINT                   NOT NULL REFERENCES "spaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "userId"      BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId" BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX CONCURRENTLY "project_todo_state_workspace_space_user_unique_idx" ON "project_todo_state" ("workspaceId", "spaceId", "userId");
CREATE INDEX CONCURRENTLY "project_todo_state_spaceId_idx" ON "project_todo_state" ("spaceId");
CREATE INDEX CONCURRENTLY "project_todo_state_userId_idx" ON "project_todo_state" ("userId");

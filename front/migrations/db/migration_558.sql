-- Migration created on Apr 01, 2026
CREATE TABLE IF NOT EXISTS "project_todo_states"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "lastReadAt"  TIMESTAMP WITH TIME ZONE NOT NULL,
    "spaceId"     BIGINT                   NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "userId"      BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId" BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX CONCURRENTLY "project_todo_states_workspace_id_space_id_user_id" ON "project_todo_states" ("workspaceId", "spaceId", "userId");
CREATE INDEX CONCURRENTLY "project_todo_states_space_id" ON "project_todo_states" ("spaceId");
CREATE INDEX CONCURRENTLY "project_todo_states_user_id" ON "project_todo_states" ("userId");


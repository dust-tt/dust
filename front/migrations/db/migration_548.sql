-- Migration created on Mar 27, 2026
CREATE TABLE IF NOT EXISTS "project_todos"
(
    "createdAt"                          TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                          TIMESTAMP WITH TIME ZONE NOT NULL,
    "spaceId"                            BIGINT                   NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "userId"                             BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "createdByUserId"                    BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "createdByType"                      VARCHAR(255)             NOT NULL,
    "createdByAgentConfigurationId"      VARCHAR(255),
    "markedAsDoneByType"                 VARCHAR(255),
    "markedAsDoneByUserId"               BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "markedAsDoneByAgentConfigurationId" VARCHAR(255),
    "category"                           VARCHAR(255)             NOT NULL,
    "text"                               TEXT                     NOT NULL,
    "version"                            INTEGER                  NOT NULL DEFAULT 1,
    "status"                             VARCHAR(255)             NOT NULL DEFAULT 'todo',
    "doneAt"                             TIMESTAMP WITH TIME ZONE,
    "actorRationale"                     TEXT,
    "workspaceId"                        BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                                 BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY "project_todos_ws_space_user_version_idx" ON "project_todos" ("workspaceId", "spaceId", "userId", "version");
CREATE INDEX CONCURRENTLY "project_todos_ws_space_user_idx" ON "project_todos" ("workspaceId", "spaceId", "userId");
CREATE INDEX CONCURRENTLY "project_todos_spaceId_idx" ON "project_todos" ("spaceId");
CREATE INDEX CONCURRENTLY "project_todos_userId_idx" ON "project_todos" ("userId");
CREATE INDEX CONCURRENTLY "project_todos_createdByUserId_idx" ON "project_todos" ("createdByUserId");
CREATE INDEX CONCURRENTLY "project_todos_markedAsDoneByUserId_idx" ON "project_todos" ("markedAsDoneByUserId");


CREATE TABLE IF NOT EXISTS "project_todo_conversations"
(
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "projectTodoId"  BIGINT                   NOT NULL REFERENCES "project_todos" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "conversationId" BIGINT                   NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId"    BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"             BIGSERIAL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY "project_todo_conversations_ws_todo_idx" ON "project_todo_conversations" ("workspaceId", "projectTodoId");
CREATE INDEX CONCURRENTLY "project_todo_conversations_projectTodoId_idx" ON "project_todo_conversations" ("projectTodoId");
CREATE UNIQUE INDEX CONCURRENTLY "project_todo_conversations_ws_unique_idx" ON "project_todo_conversations" ("workspaceId", "projectTodoId", "conversationId");
CREATE INDEX CONCURRENTLY "project_todo_conversations_conversationId_idx" ON "project_todo_conversations" ("conversationId");

CREATE TABLE IF NOT EXISTS "project_todo_sources"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "projectTodoId"        BIGINT                   NOT NULL REFERENCES "project_todos" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "sourceType"           VARCHAR(255)             NOT NULL,
    "sourceConversationId" BIGINT REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY "project_todo_sources_ws_todo_idx" ON "project_todo_sources" ("workspaceId", "projectTodoId");
CREATE INDEX CONCURRENTLY "project_todo_sources_projectTodoId_idx" ON "project_todo_sources" ("projectTodoId");
CREATE INDEX CONCURRENTLY "project_todo_sources_sourceConversationId_idx" ON "project_todo_sources" ("sourceConversationId");

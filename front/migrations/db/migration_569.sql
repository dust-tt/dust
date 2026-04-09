-- Migration created on Apr 08, 2026
CREATE TABLE IF NOT EXISTS "takeaways"
(
    "createdAt"    TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"    TIMESTAMP WITH TIME ZONE NOT NULL,
    "sId"          VARCHAR(255)             NOT NULL,
    "version"      INTEGER                  NOT NULL DEFAULT 1,
    "actionItems"  JSONB                    NOT NULL DEFAULT '[]',
    "notableFacts" JSONB                    NOT NULL DEFAULT '[]',
    "keyDecisions" JSONB                    NOT NULL DEFAULT '[]',
    "workspaceId"  BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"           BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX CONCURRENTLY "takeaways_ws_sId_version_unique_idx" ON "takeaways" ("workspaceId", "sId", "version");
CREATE INDEX CONCURRENTLY "takeaways_sId_idx" ON "takeaways" ("sId");

CREATE TABLE IF NOT EXISTS "takeaway_sources"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "takeawaySId"          VARCHAR(255)             NOT NULL,
    "sourceType"           VARCHAR(255)             NOT NULL,
    "sourceId"             VARCHAR(255)             NOT NULL,
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    PRIMARY KEY ("id")
);
CREATE INDEX CONCURRENTLY "takeaway_sources_ws_takeawaySId_idx" ON "takeaway_sources" ("workspaceId", "takeawaySId");
CREATE INDEX CONCURRENTLY "takeaway_sources_sourceType_sourceId_idx" ON "takeaway_sources" ("sourceType", "sourceId");

CREATE TABLE IF NOT EXISTS "project_todo_takeaway_sources"
(
    "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"        TIMESTAMP WITH TIME ZONE NOT NULL,
    "projectTodoId"    BIGINT                   NOT NULL REFERENCES "project_todos" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "takeawaySourceId" BIGINT                   NOT NULL REFERENCES "takeaway_sources" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId"      BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"               BIGSERIAL,
    PRIMARY KEY ("id")
);
CREATE INDEX CONCURRENTLY "project_todo_takeaway_sources_ws_todo_idx" ON "project_todo_takeaway_sources" ("workspaceId", "projectTodoId");
CREATE UNIQUE INDEX CONCURRENTLY "project_todo_takeaway_sources_unique_idx" ON "project_todo_takeaway_sources" ("workspaceId", "projectTodoId", "takeawaySourceId");
CREATE INDEX CONCURRENTLY "project_todo_takeaway_sources_project_todo_id_idx" ON "project_todo_takeaway_sources" ("projectTodoId");
CREATE INDEX CONCURRENTLY "project_todo_takeaway_sources_takeaway_source_id_idx" ON "project_todo_takeaway_sources" ("takeawaySourceId");

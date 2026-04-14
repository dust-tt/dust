-- Migration created on Apr 14, 2026
-- Replace the multi-row versioning pattern (sId + version columns in the main
-- table) with a stable main row + separate version snapshot tables for both
-- project_todos and takeaways.
-- Data is NOT migrated — these tables are truncated before schema changes.

BEGIN;

-- ── project_todos: clear data and dependent tables ────────────────────────
-- Truncate in FK dependency order: join tables first, then parent tables.
TRUNCATE "project_todo_takeaway_sources", "project_todo_conversations", "project_todos", "project_todo_sources";

-- ── project_todo_versions: new version snapshot table ─────────────────────
CREATE TABLE IF NOT EXISTS "project_todo_versions"
(
    "id"                                 BIGSERIAL PRIMARY KEY,
    "createdAt"                          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId"                        BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "projectTodoId"                      BIGINT                   NOT NULL REFERENCES "project_todos" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "version"                            INTEGER                  NOT NULL,
    "markedAsDoneByType"                 VARCHAR(255),
    "markedAsDoneByUserId"               BIGINT,
    "markedAsDoneByAgentConfigurationId" VARCHAR(255),
    "category"                           VARCHAR(255)             NOT NULL,
    "text"                               TEXT                     NOT NULL,
    "status"                             VARCHAR(255)             NOT NULL DEFAULT 'todo',
    "doneAt"                             TIMESTAMP WITH TIME ZONE,
    "actorRationale"                     TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_todo_versions_ws_todo_version_unique_idx"
    ON "project_todo_versions" ("workspaceId", "projectTodoId", "version");

-- ── takeaways: clear data ─────────────────────────────────────────────────
-- takeaway_sources used a plain string reference in the old schema (no proper
-- FK to takeaways), so it is truncated separately from takeaways.
-- project_todo_takeaway_sources was already cleared above.
TRUNCATE "takeaway_sources", "takeaways", "project_todo_takeaway_sources";

-- ── takeaway_sources: replace string reference with integer FK ─────────────
ALTER TABLE "takeaway_sources"
    ADD COLUMN "takeawaysId" BIGINT NOT NULL
        REFERENCES "takeaways" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "takeaway_sources_ws_takeawaysId_idx"
    ON "takeaway_sources" ("workspaceId", "takeawaysId");

-- ── takeaway_versions: new version snapshot table ─────────────────────────
CREATE TABLE IF NOT EXISTS "takeaway_versions"
(
    "id"           BIGSERIAL PRIMARY KEY,
    "createdAt"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId"  BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "takeawaysId"  BIGINT                   NOT NULL REFERENCES "takeaways" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "version"      INTEGER                  NOT NULL,
    "actionItems"  JSONB                    NOT NULL DEFAULT '[]',
    "notableFacts" JSONB                    NOT NULL DEFAULT '[]',
    "keyDecisions" JSONB                    NOT NULL DEFAULT '[]'
);

CREATE UNIQUE INDEX IF NOT EXISTS "takeaway_versions_ws_takeawaysId_version_unique_idx"
    ON "takeaway_versions" ("workspaceId", "takeawaysId", "version");

COMMIT;

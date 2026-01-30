-- Migration created on Jan 30, 2026
ALTER TABLE conversations ADD COLUMN "kind" VARCHAR(255) NOT NULL DEFAULT 'regular';

CREATE INDEX CONCURRENTLY "conversations_workspace_id_kind_idx"
    ON "conversations" ("workspaceId", "kind");

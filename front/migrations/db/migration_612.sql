-- Migration created on Apr 27, 2026
-- Replace non-unique index with a unique one so that upserts on workspace_sensitivity_label_configs work correctly.
DROP INDEX CONCURRENTLY IF EXISTS "workspace_sensitivity_label_configs_workspace_source_idx";

CREATE UNIQUE INDEX CONCURRENTLY "workspace_sensitivity_label_configs_workspace_source_idx"
  ON "workspace_sensitivity_label_configs" ("workspaceId", "sourceType", "sourceId");
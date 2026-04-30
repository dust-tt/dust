-- Migration created on Apr 30, 2026
-- Drop redundant indexes on workspace_sandbox_env_vars: the workspaceId-only
-- lookup is served by the leftmost prefix of the (workspaceId, name) unique
-- index, and the createdByUserId / lastUpdatedByUserId columns are never
-- queried directly (joins go through users.id).
DROP INDEX CONCURRENTLY IF EXISTS "workspace_sandbox_env_vars_workspace_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "workspace_sandbox_env_vars_created_by_user_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "workspace_sandbox_env_vars_last_updated_by_user_id_idx";

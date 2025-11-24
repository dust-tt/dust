-- Migration created on Nov 24, 2025

CREATE INDEX CONCURRENTLY IF NOT EXISTS "group_memberships_group_workspace_status_start_idx"
ON "group_memberships" ("groupId", "workspaceId", "status", "startAt");

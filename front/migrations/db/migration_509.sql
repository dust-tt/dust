-- Migration created on Feb 13, 2026
CREATE INDEX CONCURRENTLY "group_memberships_user_id_workspace_id_status_start_at" ON "group_memberships" ("userId", "workspaceId", "status", "startAt");

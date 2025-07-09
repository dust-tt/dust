-- Migration created on May 23, 2025
CREATE INDEX CONCURRENTLY "memberships_workspace_id_user_id_start_at_end_at" ON "memberships" ("workspaceId", "userId", "startAt", "endAt");

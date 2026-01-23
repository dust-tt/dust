-- Migration created on Jan 20, 2026
-- Prevent race condition creating duplicate active memberships for same user/workspace
CREATE UNIQUE INDEX CONCURRENTLY "memberships_user_workspace_active_unique"
ON "memberships" ("userId", "workspaceId")
WHERE "endAt" IS NULL;

-- Migration created on Sep 23, 2025
CREATE INDEX CONCURRENTLY "memberships_workspace_id_end_at"
    ON "memberships" ("workspaceId", "endAt")
    INCLUDE ("startAt", "userId");

CREATE INDEX CONCURRENTLY "memberships_workspace_id_start_at_end_at_null"
    ON "memberships" ("workspaceId", "startAt")
    INCLUDE ("userId")
    WHERE "endAt" IS NULL;

-- Migration: Add firstUsedAt column to memberships table
-- This column stores when a user first logged in after joining a workspace,
-- eliminating the need to join with the users table for seat billing queries.

ALTER TABLE "memberships" ADD COLUMN "firstUsedAt" TIMESTAMP WITH TIME ZONE;

-- Create partial index for the count query (counting first-used seats)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "memberships_workspace_first_used_at_idx"
  ON "memberships" ("workspaceId", "firstUsedAt")
  WHERE "firstUsedAt" IS NOT NULL;

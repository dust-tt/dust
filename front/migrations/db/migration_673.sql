-- Migration created on Jun 09, 2026
CREATE TABLE IF NOT EXISTS "membership_upgrade_requests" ("createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "status" VARCHAR(16) NOT NULL DEFAULT 'pending', "resolvedAt" TIMESTAMP WITH TIME ZONE DEFAULT NULL, "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, "id"  BIGSERIAL , "userId" BIGINT NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, "resolvedByUserId" BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE, PRIMARY KEY ("id"));
CREATE INDEX "membership_upgrade_requests_workspace_status_idx" ON "membership_upgrade_requests" ("workspaceId", "status");
CREATE UNIQUE INDEX "membership_upgrade_requests_workspace_user_pending_idx" ON "membership_upgrade_requests" ("workspaceId", "userId") WHERE "status" = 'pending';
CREATE INDEX "membership_upgrade_requests_user_idx" ON "membership_upgrade_requests" ("userId");
CREATE INDEX "membership_upgrade_requests_resolved_by_user_idx" ON "membership_upgrade_requests" ("resolvedByUserId");

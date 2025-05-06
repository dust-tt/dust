-- Migration created on May 06, 2025
CREATE INDEX CONCURRENTLY "idx_subscriptions_workspace_id_status_plan_id" ON "subscriptions" ("workspaceId", "status", "planId");

-- Migration created on Nov 07, 2025
CREATE INDEX "webhook_requests_workspace_id_webhook_source_id_created_at" ON "webhook_requests" ("workspaceId", "webhookSourceId", "createdAt");

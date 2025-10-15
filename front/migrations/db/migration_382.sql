-- Migration created on Oct 15, 2024
ALTER TABLE "webhook_sources"
ADD COLUMN "remoteWebhookId" TEXT,
ADD COLUMN "remoteRepository" TEXT,
ADD COLUMN "remoteConnectionId" JSONB;

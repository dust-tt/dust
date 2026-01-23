-- Migration created on Oct 15, 2024
ALTER TABLE "webhook_sources"
ADD COLUMN "remoteMetadata" JSONB,
ADD COLUMN "oauthConnectionId" TEXT;

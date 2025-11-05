-- Create broadcasts table for managing in-app announcements and changelog entries
CREATE TABLE broadcasts (
  id BIGSERIAL PRIMARY KEY,
  "sId" VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  "shortDescription" TEXT NOT NULL,
  "longDescription" TEXT,
  "mediaUrl" VARCHAR(1024),
  "mediaType" VARCHAR(50) CHECK ("mediaType" IN ('image', 'gif', 'video') OR "mediaType" IS NULL),
  "publishToChangelog" BOOLEAN NOT NULL DEFAULT TRUE,
  "shouldBroadcast" BOOLEAN NOT NULL DEFAULT TRUE,
  "targetingType" VARCHAR(50) NOT NULL DEFAULT 'all' CHECK ("targetingType" IN ('all', 'users', 'workspaces', 'plans')),
  "targetingData" JSONB,
  "startDate" TIMESTAMP WITH TIME ZONE NOT NULL,
  "endDate" TIMESTAMP WITH TIME ZONE,
  priority INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'expired')),
  "publishedAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create broadcast dismissals table for tracking which users have dismissed broadcasts
CREATE TABLE broadcast_dismissals (
  id BIGSERIAL PRIMARY KEY,
  "broadcastId" BIGINT NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  "userId" BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "workspaceId" BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  "dismissedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("broadcastId", "userId", "workspaceId")
);

-- Create indexes for efficient querying
CREATE INDEX idx_broadcast_dismissals_lookup
ON broadcast_dismissals("broadcastId", "userId", "workspaceId");

CREATE INDEX idx_broadcasts_active
ON broadcasts(status, "startDate", "endDate")
WHERE status = 'published';

CREATE INDEX idx_broadcasts_changelog
ON broadcasts("publishToChangelog", "publishedAt")
WHERE "publishToChangelog" = TRUE AND status = 'published';
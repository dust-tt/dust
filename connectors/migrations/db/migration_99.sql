-- Migration created on Oct 13, 2025
-- Create microsoft_bot_configurations table

CREATE TABLE "microsoft_bot_configurations" (
  "id" SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "connectorId" INTEGER NOT NULL,
  "botEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "tenantId" VARCHAR(255) NOT NULL
);

-- Add unique index on connectorId
CREATE UNIQUE INDEX "microsoft_bot_configurations_connectorId_idx" ON "microsoft_bot_configurations" ("connectorId");

-- Add index on tenantId for efficient lookup
CREATE UNIQUE INDEX "microsoft_bot_configurations_tenantId_idx" ON "microsoft_bot_configurations" ("tenantId");
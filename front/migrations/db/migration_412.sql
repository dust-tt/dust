-- Migration created on November 21, 2025
-- Create programmatic_usage_configurations table to manage workspace-specific configuration for programmatic API usage
-- This table maintains a 1:1 relationship with workspaces (enforced by unique index on workspaceId)
-- Amounts are stored in cents

CREATE TABLE IF NOT EXISTS "programmatic_usage_configurations" (
  "id" BIGSERIAL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "freeCreditCents" INTEGER CHECK ("freeCreditCents" >= 0),
  "defaultDiscountPercent" INTEGER NOT NULL CHECK ("defaultDiscountPercent" >= 0 AND "defaultDiscountPercent" <= 100),
  "paygCapCents" INTEGER CHECK ("paygCapCents" > 0),
  "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY ("id")
);

-- Enforce 1:1 relationship between workspace and configuration
CREATE UNIQUE INDEX "programmatic_usage_configurations_workspace_id"
  ON "programmatic_usage_configurations" ("workspaceId");

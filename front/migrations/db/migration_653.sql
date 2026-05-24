-- Migration created on May 24, 2026
-- Create credit_usage_configurations table to manage workspace-specific
-- configuration for AWU credit purchases (default discount + PAYG cap on AWU
-- consumption). Distinct from programmatic_usage_configurations, whose
-- microUSD-denominated fields drive the programmatic (token-pricing) flow.
-- Amounts here are stored in AWU credits.
-- 1:1 with workspaces (enforced by unique index on workspaceId).

CREATE TABLE IF NOT EXISTS "credit_usage_configurations" (
  "id" BIGSERIAL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "defaultDiscountPercent" INTEGER NOT NULL DEFAULT 0 CHECK ("defaultDiscountPercent" >= 0 AND "defaultDiscountPercent" <= 100),
  "paygCapCredits" INTEGER CHECK ("paygCapCredits" > 0),
  "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY ("id")
);

-- Enforce 1:1 relationship between workspace and configuration
CREATE UNIQUE INDEX "credit_usage_configurations_workspace_id"
  ON "credit_usage_configurations" ("workspaceId");

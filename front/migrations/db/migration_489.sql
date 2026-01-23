-- Migration created on Jan 23, 2026
-- Change agent_suggestions to use a proper FK to agent_configurations instead of sId + version tuple
-- Part 1: Pre-deploy - Add new column and backfill (backward compatible)
-- This migration works with the state after copilot-rename-column where:
-- - agentConfigurationIdTmp contains the agent sId (formerly agentConfigurationId)
-- - agentConfigurationVersion contains the version

-- Step 1: Add new column (nullable initially)
ALTER TABLE "agent_suggestions"
ADD COLUMN "agentConfigurationId" BIGINT;

-- Step 2: Backfill from agent_configurations table using the renamed column
UPDATE "agent_suggestions" s
SET "agentConfigurationId" = ac.id
FROM "agent_configurations" ac
WHERE ac."sId" = s."agentConfigurationIdTmp"
  AND ac."version" = s."agentConfigurationVersion";

-- Step 3: Make NOT NULL and add FK constraint
ALTER TABLE "agent_suggestions"
ALTER COLUMN "agentConfigurationId" SET NOT NULL;

ALTER TABLE "agent_suggestions"
ADD CONSTRAINT "agent_suggestions_agentConfigurationId_fkey"
FOREIGN KEY ("agentConfigurationId")
REFERENCES "agent_configurations" ("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 4: Create indexes
CREATE INDEX CONCURRENTLY "agent_suggestions_agentConfigurationId"
ON "agent_suggestions" ("agentConfigurationId");

CREATE INDEX CONCURRENTLY "agent_suggestions_list_by_agent_configuration"
ON "agent_suggestions" ("workspaceId", "agentConfigurationId", "state", "kind");

CREATE INDEX CONCURRENTLY "agent_suggestions_workspace_agent_config_kind"
ON "agent_suggestions" ("workspaceId", "agentConfigurationId", "kind");

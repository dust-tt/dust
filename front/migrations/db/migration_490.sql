-- Migration created on Jan 23, 2026
-- Change agent_suggestions to use a proper FK to agent_configurations instead of sId + version tuple
-- Part 1: Pre-deploy - Add new column and backfill (backward compatible)

-- Step 1: Drop old index and column if necessary
DROP INDEX IF EXISTS "agent_suggestions_workspace_id_agent_configuration_id";
ALTER TABLE "agent_suggestions" DROP COLUMN IF EXISTS "agentConfigurationId";

-- Step 2: Add new agentConfigurationId column (nullable initially)
ALTER TABLE "agent_suggestions"
ADD COLUMN "agentConfigurationId" BIGINT;

-- Step 3: Backfill from agent_configurations table using the renamed column
UPDATE "agent_suggestions" s
SET "agentConfigurationId" = ac.id
FROM "agent_configurations" ac
WHERE ac."sId" = s."agentConfigurationIdTmp"
  AND ac."version" = s."agentConfigurationVersion";

-- Step 4: Make NOT NULL and add FK constraint
ALTER TABLE "agent_suggestions"
ALTER COLUMN "agentConfigurationId" SET NOT NULL;

ALTER TABLE "agent_suggestions"
ADD CONSTRAINT "agent_suggestions_agentConfigurationId_fkey"
FOREIGN KEY ("agentConfigurationId")
REFERENCES "agent_configurations" ("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 5: Create indexes
CREATE INDEX CONCURRENTLY "agent_suggestions_agentConfigurationId"
ON "agent_suggestions" ("agentConfigurationId");

CREATE INDEX CONCURRENTLY "agent_suggestions_list_by_agent_configuration_idx"
ON "agent_suggestions" ("workspaceId", "agentConfigurationId", "state", "kind");

CREATE INDEX CONCURRENTLY "agent_suggestions_workspace_agent_config_kind"
ON "agent_suggestions" ("workspaceId", "agentConfigurationId", "kind");

-- Migration created on Jan 23, 2026
-- Change agent_suggestions to use a proper FK to agent_configurations instead of sId + version tuple
-- Part 2: Post-deploy - Drop old columns and index

-- Step 1: Drop old index that used the old columns
DROP INDEX IF EXISTS "agent_suggestions_workspace_agent_config";

-- Step 2: Drop old columns
ALTER TABLE "agent_suggestions" DROP COLUMN "agentConfigurationSId";
ALTER TABLE "agent_suggestions" DROP COLUMN "agentConfigurationVersion";

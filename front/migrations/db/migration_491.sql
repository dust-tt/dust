-- Migration created on Jan 23, 2026
-- Change agent_suggestions to use a proper FK to agent_configurations instead of sId + version tuple
-- Part 2: Post-deploy - Drop old columns and index

-- Step 1: Drop old index from migration_489 (on agentConfigurationIdTmp)
DROP INDEX IF EXISTS "agent_suggestions_workspace_id_agent_configuration_id_tmp";

-- Step 2: Drop old columns (agentConfigurationIdTmp was formerly agentConfigurationId containing the sId)
ALTER TABLE "agent_suggestions" DROP COLUMN "agentConfigurationIdTmp";
ALTER TABLE "agent_suggestions" DROP COLUMN "agentConfigurationVersion";

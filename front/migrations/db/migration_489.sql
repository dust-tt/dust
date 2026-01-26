-- Migration created on Jan 23, 2026

ALTER TABLE "agent_suggestions" ADD COLUMN "agentConfigurationIdTmp" VARCHAR(255);

-- Copy data from old column to new column
UPDATE "agent_suggestions" SET "agentConfigurationIdTmp" = "agentConfigurationId";

-- Make the new column NOT NULL after data is copied
ALTER TABLE "agent_suggestions" ALTER COLUMN "agentConfigurationIdTmp" SET NOT NULL;

-- Create new index on the new column
CREATE INDEX CONCURRENTLY "agent_suggestions_workspace_id_agent_configuration_id_tmp" ON "agent_suggestions" ("workspaceId", "agentConfigurationIdTmp");


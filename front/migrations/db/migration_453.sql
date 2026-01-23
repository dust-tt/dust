-- Migration created on Dec 17, 2025
-- Drop the agent_reasoning_configurations table and its constraints

-- Drop foreign key constraints first
ALTER TABLE "agent_reasoning_configurations" DROP CONSTRAINT IF EXISTS "agent_reasoning_configurations_mcpServerConfigurationId_fkey";
ALTER TABLE "agent_reasoning_configurations" DROP CONSTRAINT IF EXISTS "agent_reasoning_configurations_workspaceId_fkey";

-- Drop indexes
DROP INDEX IF EXISTS "agent_reasoning_config_workspace_id_mcp_srv_config_id";
DROP INDEX IF EXISTS "agent_reasoning_configurations_s_id";

-- Drop the table
DROP TABLE IF EXISTS "agent_reasoning_configurations";

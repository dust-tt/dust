-- Migration created on Jul 01, 2025
-- Remove processConfigurationId column from agent_data_source_configurations

-- Drop the foreign key constraint from agent_data_source_configurations
ALTER TABLE agent_data_source_configurations DROP CONSTRAINT IF EXISTS agent_data_source_configurations_processConfigurationId_fkey;

-- Drop the processConfigurationId column from agent_data_source_configurations
ALTER TABLE agent_data_source_configurations DROP COLUMN IF EXISTS "processConfigurationId";
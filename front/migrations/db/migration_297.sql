-- Migration created on Jul 01, 2025
-- Remove process action tables and related columns

-- Drop the foreign key constraint from agent_data_source_configurations
ALTER TABLE agent_data_source_configurations DROP CONSTRAINT IF EXISTS agent_data_source_configurations_processConfigurationId_fkey;

-- Drop the processConfigurationId column from agent_data_source_configurations
ALTER TABLE agent_data_source_configurations DROP COLUMN IF EXISTS "processConfigurationId";

-- Drop the process action tables
DROP TABLE IF EXISTS agent_process_actions;
DROP TABLE IF EXISTS agent_process_configurations;
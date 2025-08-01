-- Migration created on Jul 01, 2025
-- Drop process action tables (to be run after ensuring no more references)

-- Drop the process action tables
DROP TABLE IF EXISTS agent_process_actions;
DROP TABLE IF EXISTS agent_process_configurations;
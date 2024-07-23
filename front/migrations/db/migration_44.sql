-- Migration created on Jul 23, 2024
ALTER TABLE agent_tables_query_configuration_tables ALTER COLUMN "tableId" TYPE VARCHAR(512);
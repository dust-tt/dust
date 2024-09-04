-- Migration created on Sep 03, 2024
ALTER TABLE agent_tables_query_configuration_tables
ALTER COLUMN "dataSourceViewId"
SET
  NOT NULL;
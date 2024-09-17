-- Migration created on Sep 16, 2024
ALTER TABLE "agent_tables_query_configuration_tables"
ALTER COLUMN "dataSourceId"
SET
  NOT NULL;

ALTER TABLE "public"."agent_tables_query_configuration_tables"
DROP COLUMN "dataSourceIdNew";
ALTER TABLE "agent_data_source_configurations"
DROP CONSTRAINT IF EXISTS "agent_data_source_configurations_dataSourceViewId_fkey";

ALTER TABLE "agent_data_source_configurations"
DROP CONSTRAINT IF EXISTS "agent_data_source_configurations_dataSourceViewId_fkey1";

ALTER TABLE "agent_data_source_configurations"
ADD FOREIGN KEY ("dataSourceViewId") REFERENCES "data_source_views" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
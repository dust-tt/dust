-- Migration created on Aug 06, 2024
ALTER TABLE "agent_data_source_configurations"  ADD FOREIGN KEY ("dataSourceViewId") REFERENCES "data_source_views" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

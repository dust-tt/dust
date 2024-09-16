-- Migration created on Sep 15, 2024
ALTER TABLE "agent_tables_query_configuration_tables" ADD FOREIGN KEY ("dataSourceId") REFERENCES "data_sources" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
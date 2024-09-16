-- Migration created on Sep 15, 2024
ALTER TABLE "public"."agent_tables_query_configuration_tables" ADD COLUMN "dataSourceIdNew" INTEGER REFERENCES "data_sources" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

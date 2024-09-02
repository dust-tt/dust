-- Migration created on Sep 02, 2024
ALTER TABLE "public"."agent_tables_query_configuration_tables"
ADD COLUMN "dataSourceViewId" INTEGER REFERENCES "data_source_views" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
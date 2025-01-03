-- Migration created on Jan 02, 2025
CREATE INDEX CONCURRENTLY "tracker_data_source_configurations_data_source_id" ON "tracker_data_source_configurations" ("dataSourceId");
CREATE INDEX CONCURRENTLY "tracker_data_source_configurations_data_source_view_id" ON "tracker_data_source_configurations" ("dataSourceViewId");
CREATE INDEX CONCURRENTLY "agent_tables_query_configuration_tables_data_source_id" ON "agent_tables_query_configuration_tables" ("dataSourceId");
CREATE INDEX CONCURRENTLY "agent_tables_query_configuration_tables_data_source_view_id" ON "agent_tables_query_configuration_tables" ("dataSourceViewId");
CREATE INDEX CONCURRENTLY "retrieval_documents_data_source_view_id" ON "retrieval_documents" ("dataSourceViewId");
CREATE INDEX CONCURRENTLY "labs_transcripts_configurations_data_source_view_id" ON "labs_transcripts_configurations" ("dataSourceViewId");

CREATE INDEX CONCURRENTLY idx_data_sources_nodes_data_source_document ON data_sources_nodes(data_source, document);
CREATE INDEX CONCURRENTLY idx_data_sources_nodes_data_source_table ON data_sources_nodes(data_source, "table");
CREATE INDEX CONCURRENTLY idx_data_sources_nodes_data_source_folder ON data_sources_nodes(data_source, folder);

CREATE INDEX CONCURRENTLY idx_data_sources_nodes_document ON data_sources_nodes(document);
CREATE INDEX CONCURRENTLY idx_data_sources_nodes_table ON data_sources_nodes("table");
CREATE INDEX CONCURRENTLY idx_data_sources_nodes_folder ON data_sources_nodes(folder);


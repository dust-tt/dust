CREATE INDEX CONCURRENTLY idx_data_sources_nodes_parents_second ON data_sources_nodes (data_source, (parents[2]));
CREATE INDEX CONCURRENTLY idx_data_sources_nodes_parents_single ON data_sources_nodes (data_source, (array_length(parents, 1) = 1));

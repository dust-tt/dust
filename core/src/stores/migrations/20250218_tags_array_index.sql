CREATE INDEX CONCURRENTLY idx_data_sources_nodes_tags_array ON data_sources_nodes USING GIN (tags_array);

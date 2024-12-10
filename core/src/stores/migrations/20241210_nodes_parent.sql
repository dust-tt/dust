-- data sources nodes
ALTER TABLE data_sources_nodes ADD COLUMN parent_id TEXT;

CREATE INDEX CONCURRENTLY idx_data_sources_nodes_parent_id ON data_sources_nodes(parent_id);

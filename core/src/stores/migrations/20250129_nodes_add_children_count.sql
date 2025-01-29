-- migration created on 2025-01-29
ALTER TABLE data_sources_nodes ADD COLUMN children_count INTEGER NOT NULL DEFAULT 0;


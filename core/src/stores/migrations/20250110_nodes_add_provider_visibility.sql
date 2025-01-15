ALTER TABLE data_sources_nodes ADD COLUMN IF NOT EXISTS provider_visibility TEXT DEFAULT NULL;

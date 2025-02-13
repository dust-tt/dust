ALTER TABLE
    data_sources_nodes
ADD COLUMN IF NOT EXISTS
    tags_array text[] NOT NULL DEFAULT array[]::text[];

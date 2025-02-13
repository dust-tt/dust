ALTER TABLE
    "data_sources_documents"
ALTER COLUMN tags_array DROP NOT NULL;

ALTER TABLE
    "tables"
ALTER COLUMN tags_array DROP NOT NULL;

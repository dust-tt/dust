ALTER TABLE
    "data_sources_documents"
DROP COLUMN IF EXISTS tags_array;

ALTER TABLE
    "tables"
DROP COLUMN IF EXISTS tags_array;

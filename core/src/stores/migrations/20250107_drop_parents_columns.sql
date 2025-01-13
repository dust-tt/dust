DROP INDEX IF EXISTS idx_data_sources_documents_parents_array;
DROP INDEX IF EXISTS idx_tables_parents_array;

ALTER TABLE data_sources_documents DROP COLUMN IF EXISTS parents;
ALTER TABLE tables DROP COLUMN IF EXISTS parents;

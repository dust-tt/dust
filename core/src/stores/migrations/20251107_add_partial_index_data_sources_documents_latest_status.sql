CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ds_documents_data_source_document_id_status_latest
ON data_sources_documents (data_source, document_id) WHERE status = 'latest';
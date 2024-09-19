CREATE INDEX idx_status_deleted ON data_sources_documents (id) WHERE status = 'deleted';

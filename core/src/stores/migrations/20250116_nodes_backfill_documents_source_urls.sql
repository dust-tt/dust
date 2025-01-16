UPDATE data_sources_nodes
SET source_url = data_sources_documents.source_url
FROM data_sources_documents
WHERE data_sources_nodes.document = data_sources_documents.id;

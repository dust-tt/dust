-- Backfill workspaceId from data_source_views -> workspaces
UPDATE retrieval_documents
SET "workspaceId" = data_source_views."workspaceId"
FROM data_source_views
WHERE retrieval_documents."dataSourceViewId" = data_source_views.id;

-- Backfill workspaceId from retrieval_documents -> workspaces
UPDATE retrieval_document_chunks
SET "workspaceId" = retrieval_documents."workspaceId"
FROM retrieval_documents
WHERE retrieval_document_chunks."retrievalDocumentId" = retrieval_documents.id;
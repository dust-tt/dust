-- Migration created on Feb 01, 2025
CREATE INDEX CONCURRENTLY "retrieval_document_chunks_workspace_id_id" ON "retrieval_document_chunks" ("workspaceId", "id");

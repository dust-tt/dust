-- Migration created on May 12, 2025
CREATE INDEX CONCURRENTLY "retrieval_documents_workspace_id_retrieval_action_id" ON "retrieval_documents" ("workspaceId", "retrievalActionId");

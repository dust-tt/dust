-- Migration created on Jan 23, 2025
ALTER TABLE "public"."retrieval_documents" ADD COLUMN "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."retrieval_document_chunks" ADD COLUMN "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

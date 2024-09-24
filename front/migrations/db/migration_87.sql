-- Migration created on Sep 23, 2024
ALTER TABLE "public"."retrieval_documents" DROP COLUMN "dataSourceWorkspaceId";
ALTER TABLE "public"."retrieval_documents" DROP COLUMN "dataSourceId";

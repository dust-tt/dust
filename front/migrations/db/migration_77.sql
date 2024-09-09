-- Migration created on Sep 09, 2024
ALTER TABLE "public"."retrieval_documents" ADD COLUMN "dataSourceViewId" INTEGER REFERENCES "data_source_views" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

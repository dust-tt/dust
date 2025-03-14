-- Migration created on Mar 14, 2025
ALTER TABLE "public"."content_fragments" ADD COLUMN "nodeId" VARCHAR(255);
ALTER TABLE "public"."content_fragments" ADD COLUMN "nodeDataSourceViewId" BIGINT REFERENCES "data_source_views" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."content_fragments" ADD CONSTRAINT "node_fields_consistency" CHECK (
  ("nodeId" IS NULL AND "nodeDataSourceViewId" IS NULL) OR
  ("nodeId" IS NOT NULL AND "nodeDataSourceViewId" IS NOT NULL)
);
ALTER TABLE "public"."content_fragments" ADD CONSTRAINT "file_node_mutual_exclusivity" CHECK (
  NOT ("fileId" IS NOT NULL AND "nodeId" IS NOT NULL)
);

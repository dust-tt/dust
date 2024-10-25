-- Migration created on Oct 25, 2024
ALTER TABLE "public"."labs_transcripts_configurations" ADD COLUMN "dataSourceViewId" INTEGER REFERENCES "data_source_views" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."labs_transcripts_configurations" DROP COLUMN "dataSourceId";

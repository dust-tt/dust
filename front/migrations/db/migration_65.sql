-- Migration created on Aug 22, 2024
ALTER TABLE "public"."labs_transcripts_configurations" ADD COLUMN "dataSourceId" INTEGER REFERENCES "data_sources" ("id") ON DELETE SET NULL ON UPDATE SET NULL;
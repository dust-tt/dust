-- Migration created on Jan 10, 2025
ALTER TABLE "public"."tracker_generations" ADD COLUMN "maintainedDocumentId" VARCHAR(255);
ALTER TABLE "public"."tracker_generations" ADD COLUMN "maintainedDocumentDataSourceId" INTEGER REFERENCES "public"."data_sources" ("id") ON DELETE RESTRICT;

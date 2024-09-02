-- Migration created on Sep 02, 2024
ALTER TABLE "public"."data_sources"
ADD COLUMN "dustAPIDataSourceId" VARCHAR(255);

UPDATE "public"."data_sources"
SET
  "dustAPIDataSourceId" = "name";
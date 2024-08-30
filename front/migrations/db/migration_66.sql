-- Migration created on Aug 30, 2024
ALTER TABLE "public"."data_source_views"
ADD COLUMN "editedAt" TIMESTAMP WITH TIME ZONE;

ALTER TABLE "public"."data_source_views"
ADD COLUMN "editedByUserId" INTEGER REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "public"."data_source_views" SET "editedAt" = "updatedAt";

UPDATE "public"."data_source_views"
SET
    "editedByUserId" = "data_sources"."editedByUserId"
FROM "public"."data_sources"
WHERE
    "data_sources"."id" = "data_source_views"."dataSourceId";
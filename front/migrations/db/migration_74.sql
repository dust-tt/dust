-- Migration created on Sep 04, 2024
UPDATE "public"."data_source_views"
SET
    "editedByUserId" = "data_sources"."editedByUserId"
FROM "public"."data_sources"
WHERE
    "data_sources"."id" = "data_source_views"."dataSourceId"
    AND "data_source_views"."editedByUserId" IS NULL
    AND "data_sources"."editedByUserId" IS NOT NULL

-- Migration created on Sep 23, 2024
UPDATE "data_source_views"
SET
    "editedAt" = "updatedAt"
WHERE
    "editedAt" IS NULL;

UPDATE "data_source_views"
SET
    "editedByUserId" = "data_sources"."editedByUserId",
    "editedAt" = "data_sources"."editedAt"
FROM
    "data_sources"
WHERE
    "data_sources"."id" = "data_source_views"."dataSourceId"
    AND "data_source_views"."editedByUserId" IS NULL;

ALTER TABLE "data_source_views"
ALTER COLUMN "editedAt"
SET
    NOT NULL;

ALTER TABLE "data_source_views"
ALTER COLUMN "editedAt"
DROP DEFAULT;

ALTER TABLE "data_source_views"
ALTER COLUMN "editedByUserId"
SET
    NOT NULL;
-- -- This migration is dependant on a backfill script
-- -- The backfill script is: <insert_script>
-- -- run psql with --set=backfilled=1 argument if you have rune the script.

CREATE OR REPLACE FUNCTION perform_migration(backfilled boolean DEFAULT false)
RETURNS VARCHAR AS $$
BEGIN
    IF NOT backfilled THEN
        RAISE NOTICE 'The backfill script: <insert_script> is required before applying this migation. If you already did it, run psql with --set=backfilled=1 argument.';
    END IF;

-- Migration created on Sep 23, 2024
UPDATE "data_source_views"
SET "editedAt" = "updatedAt"
WHERE "editedAt" IS NULL;

UPDATE "data_source_views"
SET
    "editedByUserId" = "data_sources"."editedByUserId"
FROM "data_sources"
WHERE
    "data_sources"."id" = "data_source_views"."dataSourceId"
    AND "data_source_views"."editedByUserId" IS NULL;

ALTER TABLE "data_source_views" ALTER COLUMN "editedAt" SET NOT NULL;
ALTER TABLE "data_source_views" ALTER COLUMN "editedAt" DROP DEFAULT;
ALTER TABLE "data_source_views"
ALTER COLUMN "editedByUserId"
SET
  NOT NULL;

    RETURN 'success';
END;
$$ LANGUAGE plpgsql;

\if :{?backfilled}
   SELECT perform_migration(:'backfilled'::boolean);
\else
    \echo '!! Migration was NOT applied !!'
    \echo 'The backfill script: <insert_script> is required before applying this migation. If you already did it, run psql with --set=backfilled=1 argument.'
\endif

DROP FUNCTION perform_migration(boolean);

-- -- This migration is dependant on a backfill script
-- -- The backfill script is: 20240912_backfill_editedbyuser_id
-- -- run psql with --set=backfilled=1 argument if you have rune the script.

CREATE OR REPLACE FUNCTION perform_migration(backfilled boolean DEFAULT false)
RETURNS VARCHAR AS $$
BEGIN
    IF NOT backfilled THEN
        RAISE NOTICE 'The backfill script: 20240912_backfill_editedbyuser_id is required before applying this migation. If you already did it, run psql with --set=backfilled=1 argument.';
    END IF;

-- Migration created on Sep 23, 2024
ALTER TABLE "data_sources"
ALTER COLUMN "editedAt"
SET
  NOT NULL;

ALTER TABLE "data_sources"
ALTER COLUMN "editedAt"
DROP DEFAULT;

ALTER TABLE "data_sources"
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
    \echo 'The backfill script: 20240912_backfill_editedbyuser_id is required before applying this migation. If you already did it, run psql with --set=backfilled=1 argument.'
\endif

DROP FUNCTION perform_migration(boolean);

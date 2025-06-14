-- This migration is dependant on a backfill script
-- The backfill script is: BACKFILL_SCRIPT_NAME
-- run psql with --set=backfilled=1 argument if you have run the script.

CREATE OR REPLACE FUNCTION perform_migration(backfilled boolean DEFAULT false)
RETURNS VARCHAR AS $$
BEGIN
    IF NOT backfilled THEN
        RAISE NOTICE 'The backfill script: BACKFILL_SCRIPT_NAME is required before applying this migration. If you already did it, run psql with --set=backfilled=1 argument.';
        RETURN 'backfill_required';
    END IF;

    MIGRATION_STATEMENTS

    RETURN 'success';
END;
$$ LANGUAGE plpgsql;

\if :{?apply}
    \if :{?backfilled}
       SELECT perform_migration(:'backfilled'::boolean);
    \else
        \echo '!! Migration was NOT applied !!'
        \echo 'The backfill script: BACKFILL_SCRIPT_NAME is required before applying this migration. If you already did it, run psql with --set=backfilled=1 argument.'
    \endif
\else
    \echo '!! Migration was NOT applied !!'
    \echo 'Use npm run migration:apply -- migration_xxx.sql to apply this migration.'
\endif

DROP FUNCTION perform_migration(boolean);

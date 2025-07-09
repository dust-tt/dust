-- -- This migration is dependent on a backfill script.
-- -- The backfill script is: BACKFILL_SCRIPT_NAME.
-- -- Run the psql command with the --set=backfilled=1 flag if the script was run.

CREATE OR REPLACE FUNCTION perform_migration(backfilled boolean DEFAULT false)
RETURNS VARCHAR AS $$
BEGIN
    IF NOT backfilled THEN
        RAISE NOTICE 'The script BACKFILL_SCRIPT_NAME has to be run before applying this migration. If already done, run the psql command with the --set=backfilled=1 flag.';
    END IF;

    MIGRATION_STATEMENTS

    RETURN 'success';
END;
$$ LANGUAGE plpgsql;

\if :{?backfilled}
   SELECT perform_migration(:'backfilled'::boolean);
\else
    \echo '!! Migration was NOT applied !!'
    \echo 'The script BACKFILL_SCRIPT_NAME has to be run before applying this migration. If already done, run the psql command with the --set=backfilled=1 flag.'
\endif

DROP FUNCTION perform_migration(boolean);

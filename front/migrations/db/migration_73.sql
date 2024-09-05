-- Migration created on Sep 03, 2024
-- -- This migration is dependant on a backfill script
-- -- The backfill script is: 20240902_backfill_views_in_agent_table_query_configurations
-- -- run psql with --set=backfilled=1 argument if you have rune the script.

CREATE OR REPLACE FUNCTION perform_migration(backfilled boolean DEFAULT false)
RETURNS VARCHAR AS $$
BEGIN
    IF NOT backfilled THEN
        RAISE NOTICE 'The backfill script: 20240902_backfill_views_in_agent_table_query_configurations is required before applying this migation. If you already did it, run psql with --set=backfilled=1 argument.';
    END IF;

    ALTER TABLE agent_tables_query_configuration_tables
    ALTER COLUMN "dataSourceViewId"
    SET
      NOT NULL;

    RETURN 'success';
END;
$$ LANGUAGE plpgsql;

\if :{?backfilled}
   SELECT perform_migration(:'backfilled'::boolean);
\else
    \echo '!! Migration was NOT applied !!'
    \echo 'The backfill script: 20240902_backfill_views_in_agent_table_query_configurations is required before applying this migation. If you already did it, run psql with --set=backfilled=1 argument.'
\endif

DROP FUNCTION perform_migration(boolean);

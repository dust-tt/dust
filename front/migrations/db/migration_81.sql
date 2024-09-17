-- -- This migration is dependant on a backfill script
-- -- The backfill script is: 20240916_backfill_ds_in_agent_table_query_configurations.ts
-- -- run psql with --set=backfilled=1 argument if you have rune the script.

CREATE OR REPLACE FUNCTION perform_migration(backfilled boolean DEFAULT false)
RETURNS VARCHAR AS $$
BEGIN
    IF NOT backfilled THEN
        RAISE NOTICE 'The backfill script: 20240916_backfill_ds_in_agent_table_query_configurations.ts is required before applying this migation. If you already did it, run psql with --set=backfilled=1 argument.';
    END IF;

-- Migration created on Sep 15, 2024
ALTER TABLE "public"."agent_tables_query_configuration_tables"
DROP COLUMN "dataSourceId";

DROP INDEX IF EXISTS agent_tables_query_configuration_table_unique;

ALTER TABLE "agent_tables_query_configuration_tables"
ALTER COLUMN "dataSourceIdNew"
SET
  NOT NULL;

ALTER TABLE "agent_tables_query_configuration_tables"
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
    \echo 'The backfill script: 20240916_backfill_ds_in_agent_table_query_configurations.ts is required before applying this migation. If you already did it, run psql with --set=backfilled=1 argument.'
\endif

DROP FUNCTION perform_migration(boolean);
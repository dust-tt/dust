-- -- This migration is dependant on a backfill script
-- -- The backfill script is: 20240904_data_source_id_to_connector.ts
-- -- run psql with --set=backfilled=1 argument if you have rune the script.

CREATE OR REPLACE FUNCTION perform_migration(backfilled boolean DEFAULT false)
RETURNS VARCHAR AS $$
BEGIN
    IF NOT backfilled THEN
        RAISE NOTICE 'The backfill script: 20240904_data_source_id_to_connector.ts is required before applying this migation. If you already did it, run psql with --set=backfilled=1 argument.';
    END IF;
    
    -- Migration created on Sep 05, 2024
    CREATE UNIQUE INDEX "connectors_workspace_id_data_source_id" ON "connectors" ("workspaceId", "dataSourceId");
    ALTER TABLE "connectors" DROP COLUMN "dataSourceName";
    ALTER TABLE "connectors" ALTER COLUMN "dataSourceId" SET NOT NULL;
    ALTER TABLE "connectors" ALTER COLUMN "dataSourceId" DROP DEFAULT;

    RETURN 'success';
END;
$$ LANGUAGE plpgsql;

\if :{?backfilled}
   SELECT perform_migration(:'backfilled'::boolean);
\else
    \echo '!! Migration was NOT applied !!'
    \echo 'The backfill script: 20240904_data_source_id_to_connector.ts is required before applying this migation. If you already did it, run psql with --set=backfilled=1 argument.'
\endif

DROP FUNCTION perform_migration(boolean);

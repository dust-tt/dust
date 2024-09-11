-- This migration is dependant on a backfill script
-- The backfill script is: 20240906_backfill_apps_vault_ids.ts
-- run psql with --set=backfilled=1 argument if you have rune the script.

CREATE OR REPLACE FUNCTION perform_migration(backfilled boolean DEFAULT false)
RETURNS VARCHAR AS $$
BEGIN
    IF NOT backfilled THEN
        RAISE NOTICE 'The backfill script: 20240911_backfill_views_in_retrieval_documents.ts is required before applying this migration. If you already did it, run psql with --set=backfilled=1 argument.';
    END IF;

-- Migration created on Sep 11, 2024
ALTER TABLE "retrieval_documents" ALTER COLUMN "dataSourceViewId" SET NOT NULL;ALTER TABLE "retrieval_documents"  ADD FOREIGN KEY ("dataSourceViewId") REFERENCES "data_source_views" ("id") ON DELETE SET NULL ON UPDATE CASCADE;


    RETURN 'success';
END;
$$ LANGUAGE plpgsql;

\if :{?backfilled}
   SELECT perform_migration(:'backfilled'::boolean);
\else
    \echo '!! Migration was NOT applied !!'
    \echo 'The backfill script: 20240906_backfill_apps_vault_ids.ts is required before applying this migation. If you already did it, run psql with --set=backfilled=1 argument.'
\endif

DROP FUNCTION perform_migration(boolean);

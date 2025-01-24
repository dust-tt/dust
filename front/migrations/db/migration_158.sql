-- The backfill script is: 20250124_backfill_run_usages
-- run psql with --set=backfilled=1 argument if you have rune the script.
CREATE OR REPLACE FUNCTION perform_migration(backfilled boolean DEFAULT false)
RETURNS VARCHAR AS $$
BEGIN
    IF NOT backfilled THEN
        RAISE NOTICE 'The backfill script: 20250124_backfill_run_usages.ts is required before applying this migration. If you already did it, run psql with --set=backfilled=1 argument.';
    END IF;

-- Migration created on Jan 24, 2025
ALTER TABLE "public"."run_usages" ALTER COLUMN "workspaceId" SET NOT NULL;

    RETURN 'success';
END;
$$ LANGUAGE plpgsql;

\if :{?backfilled}
   SELECT perform_migration(:'backfilled'::boolean);
\else
    \echo '!! Migration was NOT applied !!'
    \echo 'The backfill script: 20250124_backfill_run_usages is required before applying this migration. If you already did it, run psql with --set=backfilled=1 argument.'
\endif

DROP FUNCTION perform_migration(boolean);
-- -- This migration is dependant on a backfill script
-- -- The backfill script is: front/migrations/20240731_backfill_keys.ts
-- -- run psql with --set=backfilled=1 argument if you have rune the script.

CREATE OR REPLACE FUNCTION perform_migration(backfilled boolean DEFAULT false)
RETURNS VARCHAR AS $$
BEGIN
    IF NOT backfilled THEN
        RAISE NOTICE 'The backfill script: front/migrations/20240731_backfill_keys.ts is required before applying this migation. If you already did it, run psql with --set=backfilled=1 argument.';
    END IF;

        -- Migration created on Sep 04, 2024
    ALTER TABLE "keys"
    ALTER COLUMN "groupId"
    SET
        NOT NULL;

    RETURN 'success';
END;
$$ LANGUAGE plpgsql;

\if :{?backfilled}
   SELECT perform_migration(:'backfilled'::boolean);
\else
    \echo '!! Migration was NOT applied !!'
    \echo 'The backfill script: front/migrations/20240731_backfill_keys.ts is required before applying this migation. If you already did it, run psql with --set=backfilled=1 argument.'
\endif

DROP FUNCTION perform_migration(boolean);

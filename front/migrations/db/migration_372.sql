-- -- This migration is dependant on a backfill script
-- -- The backfill script is: 20251006_set_webhook_source_url_secret_not_null
-- -- run psql with --set=backfilled=1 argument if you have rune the script.

CREATE OR REPLACE FUNCTION perform_migration(backfilled boolean DEFAULT false)
RETURNS VARCHAR AS $$
BEGIN
    IF NOT backfilled THEN
        RAISE NOTICE 'The backfill script: 20251006_set_webhook_source_url_secret_not_null.ts is required before applying this migation. If you already did it, run psql with --set=backfilled=1 argument.';
    END IF;

-- Migration created on Oct 06, 2025
ALTER TABLE "webhook_sources" ALTER COLUMN "urlSecret" SET NOT NULL;ALTER TABLE "webhook_sources" ALTER COLUMN "urlSecret" DROP DEFAULT;ALTER TABLE "webhook_sources" ALTER COLUMN "urlSecret" TYPE TEXT;

    RETURN 'success';
END;
$$ LANGUAGE plpgsql;

\if :{?backfilled}
   SELECT perform_migration(:'backfilled'::boolean);
\else
    \echo '!! Migration was NOT applied !!'
    \echo 'The backfill script: 20251006_set_webhook_source_url_secret_not_null.ts is required before applying this migation. If you already did it, run psql with --set=backfilled=1 argument.'
\endif

DROP FUNCTION perform_migration(boolean);

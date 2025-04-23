-- -- This migration is dependant on a backfill script
-- -- The backfill script is: 20250418_convert_schemas_to_jsonschema.ts
-- -- run psql with --set=backfilled=1 argument if you have rune the script.

CREATE OR REPLACE FUNCTION perform_migration(backfilled boolean DEFAULT false)
RETURNS VARCHAR AS $$
BEGIN
    IF NOT backfilled THEN
        RAISE NOTICE 'The backfill script: 20250418_convert_schemas_to_jsonschema.ts is required before applying this migation. If you already did it, run psql with --set=backfilled=1 argument.';
    END IF;

-- Migration created on Apr 18, 2025
ALTER TABLE "public"."agent_process_configurations" DROP COLUMN "schema";
ALTER TABLE "public"."agent_process_actions" DROP COLUMN "schema";

    RETURN 'success';
END;
$$ LANGUAGE plpgsql;

\if :{?backfilled}
   SELECT perform_migration(:'backfilled'::boolean);
\else
    \echo '!! Migration was NOT applied !!'
    \echo 'The backfill script: 20250418_convert_schemas_to_jsonschema.ts is required before applying this migation. If you already did it, run psql with --set=backfilled=1 argument.'
\endif

DROP FUNCTION perform_migration(boolean);

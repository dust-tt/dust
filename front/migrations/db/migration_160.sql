-- The backfill script is: 20250124_backfill_agent_message_contents.ts
-- run psql with --set=backfilled=1 argument if you have rune the script.
CREATE OR REPLACE FUNCTION perform_migration(backfilled boolean DEFAULT false)
RETURNS VARCHAR AS $$
BEGIN
    IF NOT backfilled THEN
        RAISE NOTICE 'The backfill script: 20250124_backfill_agent_message_contents.ts is required before applying this migration. If you already did it, run psql with --set=backfilled=1 argument.';
    END IF;

-- Migration created on Jan 24, 2025
ALTER TABLE "public"."agent_browse_actions" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."agent_browse_configurations" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."agent_conversation_include_file_actions" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."agent_data_source_configurations" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."agent_dust_app_run_actions" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."agent_dust_app_run_configurations" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."agent_message_contents" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."agent_process_actions" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."agent_process_configurations" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."agent_retrieval_actions" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."agent_retrieval_configurations" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."agent_tables_query_actions" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."agent_tables_query_configuration_tables" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."agent_tables_query_configurations" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."agent_websearch_actions" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."agent_websearch_configurations" ALTER COLUMN "workspaceId" SET NOT NULL;

    RETURN 'success';
END;
$$ LANGUAGE plpgsql;

\if :{?backfilled}
   SELECT perform_migration(:'backfilled'::boolean);
\else
    \echo '!! Migration was NOT applied !!'
    \echo 'The backfill script: 20250124_backfill_agent_message_contents is required before applying this migration. If you already did it, run psql with --set=backfilled=1 argument.'
\endif

DROP FUNCTION perform_migration(boolean);
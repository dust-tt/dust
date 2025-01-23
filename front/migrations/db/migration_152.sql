-- The backfill script is: 20240912_backfill_editedbyuser_id
-- run psql with --set=backfilled=1 argument if you have rune the script.

CREATE OR REPLACE FUNCTION perform_migration(backfilled boolean DEFAULT false)
RETURNS VARCHAR AS $$
BEGIN
    IF NOT backfilled THEN
        RAISE NOTICE 'The backfill script: 20250123_backfill_workspace_id_conversation_related_models is required before applying this migation. If you already did it, run psql with --set=backfilled=1 argument.';
    END IF;

-- Migration created on Jan 23, 2025
ALTER TABLE "public"."conversation_participants" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."user_messages" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."agent_messages" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."messages" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."message_reactions" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."mentions" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "public"."content_fragments" ALTER COLUMN "workspaceId" SET NOT NULL;

    RETURN 'success';
END;
$$ LANGUAGE plpgsql;

\if :{?backfilled}
   SELECT perform_migration(:'backfilled'::boolean);
\else
    \echo '!! Migration was NOT applied !!'
    \echo 'The backfill script: 20250123_backfill_workspace_id_conversation_related_models is required before applying this migation. If you already did it, run psql with --set=backfilled=1 argument.'
\endif

DROP FUNCTION perform_migration(boolean);
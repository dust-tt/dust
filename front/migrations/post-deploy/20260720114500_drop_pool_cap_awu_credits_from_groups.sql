/*
Post-deploy: drop the groups."poolCapAwuCredits" column.

The per-group usage spend limit now lives in the group_pool_caps table
(created and backfilled in the pre-deploy migration). Run after the code
reading/writing group_pool_caps is live.

The catch-up backfill below covers caps created by old code between the
pre-deploy backfill and the deploy. ON CONFLICT DO NOTHING keeps rows
already written to group_pool_caps by the new code (which no longer touches
the groups column) as the source of truth.
 */
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
INSERT INTO "public"."group_pool_caps" ("createdAt", "updatedAt", "workspaceId", "groupId", "poolCapAwuCredits")
SELECT now(), now(), "workspaceId", "id", "poolCapAwuCredits"
FROM "public"."groups"
WHERE "poolCapAwuCredits" IS NOT NULL
ON CONFLICT ("groupId") DO NOTHING;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."groups"
    DROP COLUMN "poolCapAwuCredits";

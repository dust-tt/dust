-- The Discord removal migration soft-deleted data sources but left their views active.
-- Match DataSourceViewResource.softDelete by expiring content fragments before deleting views.
BEGIN;
SET LOCAL lock_timeout = '5s';

UPDATE "public"."content_fragments" AS cf
SET "nodeId" = NULL,
    "nodeDataSourceViewId" = NULL,
    "expiredReason" = 'data_source_deleted'
FROM "public"."data_source_views" AS dsv
JOIN "public"."data_sources" AS ds
  ON ds."id" = dsv."dataSourceId"
  AND ds."workspaceId" = dsv."workspaceId"
WHERE cf."nodeDataSourceViewId" = dsv."id"
  AND cf."workspaceId" = dsv."workspaceId"
  AND ds."connectorProvider" = 'discord_bot'
  AND ds."deletedAt" IS NOT NULL;

UPDATE "public"."data_source_views" AS dsv
SET "deletedAt" = NOW()
FROM "public"."data_sources" AS ds
WHERE ds."id" = dsv."dataSourceId"
  AND ds."workspaceId" = dsv."workspaceId"
  AND ds."connectorProvider" = 'discord_bot'
  AND ds."deletedAt" IS NOT NULL
  AND dsv."deletedAt" IS NULL;

COMMIT;

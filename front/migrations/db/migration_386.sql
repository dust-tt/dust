-- Migration created on Oct 20, 2025
UPDATE "webhook_sources_views" wsv
SET "customName" = ws.name
FROM "webhook_sources" ws
WHERE wsv."webhookSourceId" = ws.id
  AND wsv."customName" IS NULL;

ALTER TABLE "webhook_sources_views"
ALTER COLUMN "customName" SET NOT NULL;

-- Migration created on Apr 30, 2025
ALTER TABLE "public"."notion_databases" ADD COLUMN "upsertRequestedRunTs" TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE "public"."notion_databases" ADD COLUMN "lastUpsertedRunTs" TIMESTAMP WITH TIME ZONE DEFAULT NULL;
CREATE INDEX CONCURRENTLY "notion_databases_connectorId_lastUpsertedRunTs_idx" ON "public"."notion_databases" ("connectorId", "lastUpsertedRunTs");
CREATE INDEX CONCURRENTLY "notion_databases_connectorId_upsertRequestedRunTs_idx" ON "public"."notion_databases" ("connectorId", "upsertRequestedRunTs");
-- Migration created on Mar 05, 2025
ALTER TABLE "public"."gong_configurations" ADD COLUMN "lastSyncTimestamp" BIGINT;
ALTER TABLE "public"."gong_configurations" DROP COLUMN "timestampCursor";

CREATE TABLE IF NOT EXISTS "gong_users" ("createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "email" VARCHAR(255) NOT NULL, "emailAliases" VARCHAR(255)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(255)[], "firstName" VARCHAR(255), "gongId" VARCHAR(255), "lastName" VARCHAR(255), "connectorId" BIGINT NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, "id"  BIGSERIAL , PRIMARY KEY ("id"));

CREATE UNIQUE INDEX "gong_user_models_connector_id_gong_id" ON "gong_users" ("connectorId", "gongId");

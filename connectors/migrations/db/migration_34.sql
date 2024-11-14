-- Migration created on Nov 14, 2024
CREATE TABLE IF NOT EXISTS "zendesk_timestamp_cursors"
(
    "id"                        SERIAL,
    "createdAt"                 TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"                 TIMESTAMP WITH TIME ZONE NOT NULL,
    "timestampCursor"           TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    "connectorId"               INTEGER                  NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "zendesk_timestamp_cursors_connector_id" ON "zendesk_timestamp_cursors" ("connectorId");

ALTER TABLE "public"."zendesk_categories" ALTER COLUMN "description" TYPE TEXT;
ALTER TABLE "public"."zendesk_tickets" ALTER COLUMN "subject" TYPE TEXT;

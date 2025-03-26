-- Migration created on Mar 05, 2025
CREATE TABLE IF NOT EXISTS "gong_transcripts"
(
    "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
    "callId"      TEXT                     NOT NULL,
    "title"       TEXT                     NOT NULL,
    "url"         TEXT                     NOT NULL,
    "connectorId" BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"          BIGSERIAL,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "gong_transcripts_connector_id_call_id" ON "gong_transcripts" ("connectorId", "callId");

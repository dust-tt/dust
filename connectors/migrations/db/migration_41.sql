-- Migration created on Dec 12, 2024
CREATE UNIQUE INDEX CONCURRENTLY "slack_messages_connector_id_channel_id_document_id" ON "slack_messages" ("connectorId", "channelId", "documentId");
DROP INDEX IF EXISTS "slack_messages_connector_id_channel_id_message_ts";

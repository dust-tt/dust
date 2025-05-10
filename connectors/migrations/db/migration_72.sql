-- Migration created on May 09, 2025
CREATE TABLE IF NOT EXISTS "slack_threads" (
    "createdAt" timestamp WITH time zone NOT NULL,
    "updatedAt" timestamp WITH time zone NOT NULL,
    "slackChannelId" varchar(255) NOT NULL,
    "slackThreadTs" varchar(255) NOT NULL,
    "skipReason" varchar(255),
    "connectorId" bigint NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id" bigserial,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "slack_threads_slack_channel_id_slack_thread_ts_connector_id" ON "slack_threads" ("slackChannelId", "slackThreadTs", "connectorId");
CREATE INDEX "slack_threads_connector_id" ON "slack_threads" ("connectorId");
CREATE INDEX "slack_threads_slack_channel_id_updated_at" ON "slack_threads" ("slackChannelId", "updatedAt");


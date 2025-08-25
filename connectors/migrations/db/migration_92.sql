-- Create slack_labs_configurations table for Labs Slack Channel Agent feature
CREATE TABLE slack_labs_configurations (
    id SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "connectorId" INTEGER NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
    "slackTeamId" VARCHAR(255) NOT NULL,
    "channelId" VARCHAR(255) NOT NULL,
    "agentConfigurationId" VARCHAR(255) NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT TRUE
);

-- Create indexes
CREATE INDEX "slack_labs_configurations_slackTeamId" ON slack_labs_configurations("slackTeamId");
CREATE UNIQUE INDEX "slack_labs_configurations_connectorId" ON slack_labs_configurations("connectorId");
CREATE INDEX "slack_labs_configurations_channelId" ON slack_labs_configurations("channelId");

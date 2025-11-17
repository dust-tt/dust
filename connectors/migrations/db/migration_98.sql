-- Migration created on Sep 26, 2025
CREATE TABLE IF NOT EXISTS "discord_configurations" (
    "id" BIGSERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "guildId" VARCHAR(255) NOT NULL,
    "botEnabled" BOOLEAN NOT NULL DEFAULT false,
    "connectorId" BIGINT NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX "discord_configurations_guild_id" ON "discord_configurations" ("guildId");

CREATE UNIQUE INDEX "discord_configurations_connector_id" ON "discord_configurations" ("connectorId");

CREATE UNIQUE INDEX "discord_configurations_guild_id_bot_enabled" ON "discord_configurations" ("guildId", "botEnabled") WHERE "botEnabled" = true;

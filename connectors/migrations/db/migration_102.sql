CREATE TABLE "discord_user_oauth_connections" (
  "id" BIGSERIAL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "discordUserId" VARCHAR(255) NOT NULL,
  "connectionId" VARCHAR(255) NOT NULL,
  "workspaceId" VARCHAR(255) NOT NULL,
  UNIQUE("discordUserId", "workspaceId")
);

CREATE INDEX "discord_user_oauth_connections_discord_user_id" ON "discord_user_oauth_connections" ("discordUserId");
CREATE INDEX "discord_user_oauth_connections_connection_id" ON "discord_user_oauth_connections" ("connectionId");


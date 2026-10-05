-- Discord bot is removed. Hide leftover data sources before the provider disappears from the app.
SET lock_timeout = '5s';

UPDATE "public"."data_sources"
SET "deletedAt" = NOW()
WHERE "connectorProvider" = 'discord_bot'
  AND "deletedAt" IS NULL;

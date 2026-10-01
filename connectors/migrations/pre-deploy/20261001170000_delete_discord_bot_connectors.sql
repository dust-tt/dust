-- Discord bot is removed. Delete its rows before the new code stops handling the provider.
SET lock_timeout = '5s';

DELETE FROM "public"."discord_configurations";

DELETE FROM "public"."connectors"
WHERE "type" = 'discord_bot';

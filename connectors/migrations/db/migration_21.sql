DELETE FROM "slack_bot_whitelist" WHERE "botName" IS NULL;
ALTER TABLE "slack_bot_whitelist" ALTER COLUMN "botName" SET NOT NULL;
ALTER TABLE "slack_bot_whitelist" ALTER COLUMN "botName" SET DEFAULT '';
ALTER TABLE "slack_bot_whitelist" DROP COLUMN "botId";

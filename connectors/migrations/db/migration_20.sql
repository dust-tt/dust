-- Migration created on Sep 27, 2024
ALTER TABLE "slack_bot_whitelist" ADD COLUMN "botId" VARCHAR(255);
ALTER TABLE "slack_bot_whitelist" ALTER COLUMN "botName" DROP NOT NULL;
ALTER TABLE "slack_bot_whitelist" ALTER COLUMN "botName" DROP DEFAULT;

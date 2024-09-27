-- Migration created on Sep 27, 2024
ALTER TABLE "public"."slack_bot_whitelist" ADD COLUMN "botId" VARCHAR(255) NOT NULL;

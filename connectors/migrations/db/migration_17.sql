-- Migration created on Sep 27, 2024
ALTER TABLE "public"."slack_bot_whitelist" ADD COLUMN "botId" VARCHAR(255) NOT NULL;
[14:52:47.430] INFO (76703): Done;

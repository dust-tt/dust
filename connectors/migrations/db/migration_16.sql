-- Migration created on Sep 25, 2024
ALTER TABLE "public"."slack_bot_whitelist" ADD COLUMN "whitelistType" VARCHAR(255) NOT NULL DEFAULT 'summon_agent';
[22:29:37.338] INFO (1009038): Done;

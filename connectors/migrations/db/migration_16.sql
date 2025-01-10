-- Migration created on Sep 25, 2024
ALTER TABLE "public"."slack_bot_whitelist" ADD COLUMN "whitelistType" VARCHAR(255) NOT NULL DEFAULT 'summon_agent';

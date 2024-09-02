-- Migration created on Aug 26, 2024
ALTER TABLE
    "public"."slack_bot_whitelist"
ADD
    COLUMN "groupIds" VARCHAR(255) [];
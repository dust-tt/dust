-- Migration created on Sep 29, 2025
ALTER TABLE "public"."agent_messages" ADD COLUMN "originMessageId" BIGINT REFERENCES "messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

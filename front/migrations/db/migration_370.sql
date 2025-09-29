-- Migration created on Sep 29, 2025
ALTER TABLE "public"."user_messages" ADD COLUMN "userContextOriginMessageId" BIGINT REFERENCES "messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

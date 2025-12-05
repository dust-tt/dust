-- Migration created on Nov 21, 2025
ALTER TABLE "public"."user_messages"
ADD COLUMN "agenticMessageType" VARCHAR(32);

ALTER TABLE "public"."user_messages"
ADD COLUMN "agenticOriginMessageId" VARCHAR(32);
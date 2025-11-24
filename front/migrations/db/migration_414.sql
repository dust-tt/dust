-- Migration created on Nov 21, 2025
ALTER TABLE "public"."user_messages"
ADD COLUMN "runAgentType" VARCHAR(32);

ALTER TABLE "public"."user_messages"
ADD COLUMN "runAgentOriginMessageId" VARCHAR(32);
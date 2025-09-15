-- Migration created on Sep 15, 2025
ALTER TABLE "public"."user_messages" ADD COLUMN "userContextLastTriggeredRunAt" TIMESTAMP WITH TIME ZONE DEFAULT NULL;

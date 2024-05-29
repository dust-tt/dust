-- Migration created on May 28, 2024
ALTER TABLE "public"."subscriptions" ADD COLUMN "requestCancelAt" TIMESTAMP WITH TIME ZONE;

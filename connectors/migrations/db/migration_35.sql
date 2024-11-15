-- Migration created on Nov 15, 2024
ALTER TABLE "public"."zendesk_configurations" ADD COLUMN "retentionPeriodDays" INTEGER NOT NULL DEFAULT 180;
ALTER TABLE "public"."zendesk_configurations" DROP COLUMN "conversationsSlidingWindow";

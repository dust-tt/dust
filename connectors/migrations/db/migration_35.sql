-- Migration created on Nov 15, 2024
ALTER TABLE "public"."zendesk_configurations" ADD COLUMN "retentionPeriodDays" INTEGER NOT NULL DEFAULT 180;
ALTER TABLE "public"."zendesk_configurations" DROP COLUMN "conversationsSlidingWindow";

ALTER TABLE "public"."zendesk_tickets" ADD COLUMN "ticketUpdatedAt" TIMESTAMP WITH TIME ZONE;
UPDATE "public"."zendesk_tickets" SET "ticketUpdatedAt" = "createdAt";
ALTER TABLE "public"."zendesk_tickets" ALTER COLUMN "ticketUpdatedAt" SET NOT NULL;

-- Migration created on Feb 20, 2025
ALTER TABLE "public"."zendesk_configurations" ADD COLUMN "syncUnresolvedTickets" BOOLEAN NOT NULL DEFAULT false;

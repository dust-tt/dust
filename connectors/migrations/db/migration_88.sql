-- Migration created on Jul 31, 2025
ALTER TABLE "public"."zendesk_configurations" ADD COLUMN "ticketTagsToInclude" VARCHAR(255)[];
ALTER TABLE "public"."zendesk_configurations" ADD COLUMN "ticketTagsToExclude" VARCHAR(255)[];
-- Migration created on Nov 14, 2024
ALTER TABLE "public"."zendesk_configurations" ADD COLUMN "lastSuccessfulSyncStartTs" TIMESTAMP WITH TIME ZONE;

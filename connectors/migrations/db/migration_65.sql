-- Migration created on Apr 19, 2025
ALTER TABLE "public"."zendesk_configurations" ADD COLUMN "hideCustomerDetails" BOOLEAN NOT NULL DEFAULT false;

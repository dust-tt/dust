-- Migration created on Jul 31, 2025
ALTER TABLE "public"."zendesk_configurations" ADD COLUMN "organizationTagsIn" VARCHAR(255)[];
ALTER TABLE "public"."zendesk_configurations" ADD COLUMN "organizationTagsNotIn" VARCHAR(255)[];

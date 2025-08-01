-- Migration created on Jul 31, 2025
ALTER TABLE "public"."zendesk_configurations" ADD COLUMN "organizationTagsToInclude" VARCHAR(255)[];
ALTER TABLE "public"."zendesk_configurations" ADD COLUMN "organizationTagsToExclude" VARCHAR(255)[];

-- Migration created on Jan 09, 2025
ALTER TABLE "public"."zendesk_brands" ADD COLUMN "helpCenterState" VARCHAR(255) NOT NULL DEFAULT 'enabled';

-- Migration created on Aug 06, 2025
ALTER TABLE "public"."zendesk_configurations" ADD COLUMN "customFieldsConfig" JSONB NOT NULL DEFAULT '[]';

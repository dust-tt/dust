-- Migration created on Nov 27, 2025
ALTER TABLE "public"."slack_configurations" ADD COLUMN "privateIntegrationCredentialId" VARCHAR(255);

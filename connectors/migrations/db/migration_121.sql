-- Migration created on Apr 28, 2026
ALTER TABLE "public"."microsoft_configurations" ADD COLUMN "allowedSensitivityLabels" JSONB;

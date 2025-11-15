-- Migration created on Nov 14, 2025
ALTER TABLE "public"."microsoft_configurations"
ADD COLUMN "selectedSites" JSONB;
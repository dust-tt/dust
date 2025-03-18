-- Migration created on Mar 18, 2025
ALTER TABLE "public"."plans" ADD COLUMN "isManagedSalesforceAllowed" BOOLEAN DEFAULT false;

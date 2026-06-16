-- Migration created on Jun 09, 2026
-- Add member-upgrade-request toggles to credit_usage_configurations:
-- "allowMemberUpgradeRequests" (members can request a spend-limit upgrade) and
-- "upgradeRequestEmailEnabled" (admins are emailed on each request). Both
-- default to true.
SET statement_timeout = '2s';
SET lock_timeout = '2s';
ALTER TABLE "public"."credit_usage_configurations" ADD COLUMN "allowMemberUpgradeRequests" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "public"."credit_usage_configurations" ADD COLUMN "upgradeRequestEmailEnabled" BOOLEAN NOT NULL DEFAULT true;

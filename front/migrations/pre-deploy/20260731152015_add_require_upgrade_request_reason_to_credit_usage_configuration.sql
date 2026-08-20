/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."credit_usage_configurations" ADD COLUMN "requireUpgradeRequestReason" boolean DEFAULT false NOT NULL;

/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."workspace_plan_limit_overrides" ADD COLUMN "isSSOAllowed" boolean;

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."workspace_plan_limit_overrides" ADD COLUMN "isSCIMAllowed" boolean;

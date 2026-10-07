/*
Replaces `groupLimitAwuCredits` / `groupLimitPriority` (renamed to "shared usage limit"; the old
columns are dropped post-deploy). Both columns are empty in production: no group has a limit yet.
The CHECK constraint enforces that the two columns are both set or both null.
*/

/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."groups" ADD COLUMN "sharedUsageLimitAwuCredits" integer;

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."groups" ADD COLUMN "sharedUsageLimitPriority" integer;

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."groups" ADD CONSTRAINT "groups_shared_usage_limit_columns_paired_check" CHECK (("sharedUsageLimitAwuCredits" IS NULL) = ("sharedUsageLimitPriority" IS NULL)) NOT VALID;

/*
Statement 3
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."groups" VALIDATE CONSTRAINT "groups_shared_usage_limit_columns_paired_check";

/*
Statement 4
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY groups_workspace_id_shared_usage_limit_priority ON public.groups USING btree ("workspaceId", "sharedUsageLimitPriority") WHERE ("sharedUsageLimitPriority" IS NOT NULL);

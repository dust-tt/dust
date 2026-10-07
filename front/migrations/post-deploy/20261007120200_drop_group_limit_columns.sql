/*
Post-deploy: drop the `groups.groupLimitAwuCredits`, `groups.groupLimitPriority` and
`agent_messages.limitGroupModelId` columns, replaced by `sharedUsageLimitAwuCredits`,
`sharedUsageLimitPriority` and `sharedLimitGroupModelId`. This runs after the code reading the new
columns is fully rolled out, so no live pod reads the old ones anymore. They hold no data: no group
had a limit. Dropping `groupLimitPriority` also drops `groups_workspace_id_group_limit_priority`.
*/

/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."groups" DROP COLUMN IF EXISTS "groupLimitAwuCredits";

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."groups" DROP COLUMN IF EXISTS "groupLimitPriority";

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_messages" DROP COLUMN IF EXISTS "limitGroupModelId";

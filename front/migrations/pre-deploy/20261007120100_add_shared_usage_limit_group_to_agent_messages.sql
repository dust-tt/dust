/*
Replaces `limitGroupModelId` (renamed to "shared usage limit group"; the old column is dropped
post-deploy). The old column is empty in production: no group has a limit yet.
*/

/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_messages" ADD COLUMN "sharedUsageLimitGroupModelId" bigint;

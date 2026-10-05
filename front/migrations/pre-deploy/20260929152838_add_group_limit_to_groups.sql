SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."groups" ADD COLUMN "groupLimitAwuCredits" integer;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."groups" ADD COLUMN "groupLimitPriority" integer;

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY groups_workspace_id_group_limit_priority ON public.groups USING btree ("workspaceId", "groupLimitPriority") WHERE ("groupLimitPriority" IS NOT NULL);

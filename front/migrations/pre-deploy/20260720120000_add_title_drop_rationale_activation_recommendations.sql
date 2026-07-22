/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;

ALTER TABLE "public"."activation_recommendations"
  ADD COLUMN IF NOT EXISTS "title" character varying(4096) NOT NULL DEFAULT '',
  DROP COLUMN IF EXISTS "rationale";

/*
Statement 1
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY IF EXISTS "activation_recommendations_workspace_id";

/*
Statement 2
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY "activation_recommendations_workspace_user_idx" ON public.activation_recommendations USING btree ("workspaceId", "userId");

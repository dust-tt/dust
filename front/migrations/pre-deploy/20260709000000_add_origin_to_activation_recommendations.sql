/*
Add origin column to activation_recommendations.
Backfill all existing rows as "conversation" (the only origin that existed before),
then drop the default so the application must set it explicitly.

Statement 0 — add column with temporary default for the backfill
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations"
  ADD COLUMN "origin" character varying(255) NOT NULL DEFAULT 'user';

/*
Statement 1 — drop the default; all new rows must supply origin explicitly
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations"
  ALTER COLUMN "origin" DROP DEFAULT;

/*
Statement 2 — composite index supporting the frequency-cap query:
  latest system recommendation per (workspace, user)
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY "activation_recommendations_workspace_user_origin_created"
  ON public.activation_recommendations USING btree ("workspaceId", "userId", "origin", "createdAt");

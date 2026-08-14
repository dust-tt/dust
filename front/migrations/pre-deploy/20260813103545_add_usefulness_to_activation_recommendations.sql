/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;

ALTER TABLE "public"."activation_recommendations"
  ADD COLUMN IF NOT EXISTS "usefulness" character varying(255);

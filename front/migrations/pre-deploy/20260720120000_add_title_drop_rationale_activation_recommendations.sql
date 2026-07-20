SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;

ALTER TABLE "public"."activation_recommendations"
  ADD COLUMN IF NOT EXISTS "title" character varying(4096) NOT NULL DEFAULT '',
  DROP COLUMN IF EXISTS "rationale";

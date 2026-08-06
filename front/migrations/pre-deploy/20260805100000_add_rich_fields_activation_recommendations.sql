/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;

ALTER TABLE "public"."activation_recommendations"
  ADD COLUMN IF NOT EXISTS "body" character varying(1024),
  ADD COLUMN IF NOT EXISTS "steps" character varying(255)[],
  ADD COLUMN IF NOT EXISTS "ctaLabel" character varying(255),
  ADD COLUMN IF NOT EXISTS "sourceIcon" character varying(255),
  ADD COLUMN IF NOT EXISTS "sourceLabel" character varying(255);

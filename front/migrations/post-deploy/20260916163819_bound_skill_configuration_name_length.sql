-- Tightening the name column rewrites the table under an ACCESS EXCLUSIVE lock.
-- Do not cast with USING: overlong names must fail rather than be truncated.
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_configurations" ALTER COLUMN "name" TYPE character varying(256);

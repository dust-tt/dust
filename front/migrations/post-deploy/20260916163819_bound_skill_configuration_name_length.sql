SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_configurations" ALTER COLUMN "name" TYPE character varying(256);

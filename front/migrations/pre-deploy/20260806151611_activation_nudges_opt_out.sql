/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_pods" ADD COLUMN "nudgesDisabledAt" timestamp with time zone;

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" DROP CONSTRAINT "activation_nudges_triggerId_fkey";

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" ALTER COLUMN "triggerId" DROP NOT NULL;

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" ADD CONSTRAINT "activation_nudges_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES triggers(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

/*
Statement 4
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" VALIDATE CONSTRAINT "activation_nudges_triggerId_fkey";

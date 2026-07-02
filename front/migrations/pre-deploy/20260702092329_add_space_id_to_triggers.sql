/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."triggers" ADD COLUMN "spaceId" bigint;

/*
Statement 1
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY triggers_space_id ON public.triggers USING btree ("spaceId");

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."triggers" ADD CONSTRAINT "triggers_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES vaults(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."triggers" VALIDATE CONSTRAINT "triggers_spaceId_fkey";

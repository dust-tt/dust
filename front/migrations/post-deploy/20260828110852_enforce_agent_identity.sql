/*
Post-deploy: make agent_configurations.agentId NOT NULL after the backfill has run in every region.

Validate a temporary CHECK constraint before taking the brief ACCESS EXCLUSIVE lock required by
SET NOT NULL. PostgreSQL can then reuse the validated constraint instead of scanning the agent
configuration history while holding that stronger lock.
*/

/* Statement 0: add the temporary constraint without scanning existing rows. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_configurations" ADD CONSTRAINT "agent_configurations_agent_id_not_null_check" CHECK("agentId" IS NOT NULL) NOT VALID;

/* Statement 1: validate existing rows without blocking normal reads and writes. */
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_configurations" VALIDATE CONSTRAINT "agent_configurations_agent_id_not_null_check";

/* Statement 2: use the validated constraint to make the column NOT NULL without another scan. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_configurations" ALTER COLUMN "agentId" SET NOT NULL;

/* Statement 3: remove the now-redundant temporary constraint. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_configurations" DROP CONSTRAINT "agent_configurations_agent_id_not_null_check";

/*
Statement 4
  - INDEX_BUILD: Concurrent index builds avoid locking out writes on agent_configurations.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY agent_configurations_agent_id_version ON public.agent_configurations USING btree ("agentId", version);

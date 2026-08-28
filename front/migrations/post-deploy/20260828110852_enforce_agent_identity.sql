/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_configurations" ADD CONSTRAINT "agent_configurations_agent_id_not_null_check" CHECK("agentId" IS NOT NULL) NOT VALID;

/*
Statement 1
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_configurations" VALIDATE CONSTRAINT "agent_configurations_agent_id_not_null_check";

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_configurations" ALTER COLUMN "agentId" SET NOT NULL;

/*
Statement 3
*/
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

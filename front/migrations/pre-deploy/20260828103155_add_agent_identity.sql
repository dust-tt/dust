/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE "public"."agents" (
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "sId" character varying(255) COLLATE "pg_catalog"."default" NOT NULL,
    "workspaceId" bigint NOT NULL,
    "id" bigserial PRIMARY KEY
);

/*
Statement 1
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY agents_s_id ON public.agents USING btree ("sId");

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_configurations" ADD COLUMN "agentId" bigint;

/*
Statement 3
  - INDEX_BUILD: Concurrent index builds avoid locking out writes on agent_configurations.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY agent_configurations_agent_id ON public.agent_configurations USING btree ("agentId");

/*
Statement 4
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_configurations" ADD CONSTRAINT "agent_configurations_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES agents(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 5
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_configurations" VALIDATE CONSTRAINT "agent_configurations_agentId_fkey";

/*
Statement 6
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" ADD CONSTRAINT "agents_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 7
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" VALIDATE CONSTRAINT "agents_workspaceId_fkey";

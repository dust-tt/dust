/*
Pre-deploy: add the head fields of an agent to `agents`: `name`, `status`, `scope`, `reinforcement`,
`lastReinforcementAnalysisAt` and `templateId`.

Nullable for now until backfilled. Target state is to have those fields only in `agents` table.
*/

/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" ADD COLUMN "name" text COLLATE "pg_catalog"."default";

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" ADD COLUMN "lastReinforcementAnalysisAt" timestamp with time zone;

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" ADD COLUMN "reinforcement" character varying(255) COLLATE "pg_catalog"."default";

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" ADD COLUMN "scope" character varying(255) COLLATE "pg_catalog"."default";

/*
Statement 4
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" ADD COLUMN "status" character varying(255) COLLATE "pg_catalog"."default";

/*
Statement 5
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" ADD COLUMN "templateId" bigint;

/*
Statement 6
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY agents_workspace_id_status_scope ON public.agents USING btree ("workspaceId", status, scope);

/*
Statement 7
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY agents_template_id ON public.agents USING btree ("templateId");

/*
Statement 8
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" ADD CONSTRAINT "agents_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES templates(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

/*
Statement 9
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" VALIDATE CONSTRAINT "agents_templateId_fkey";

/*
Statement 10
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY agent_unique_active_name ON public.agents USING btree ("workspaceId", name) WHERE ((status)::text = 'active'::text);

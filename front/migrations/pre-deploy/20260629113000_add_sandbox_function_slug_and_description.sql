/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_functions" ADD COLUMN "slug" character varying(255) NOT NULL;

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_functions" ADD COLUMN "description" character varying(255) NOT NULL;

/*
Statement 2
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY sandbox_functions_workspace_id_space_id_slug ON public.sandbox_functions USING btree ("workspaceId", "spaceId", "slug");

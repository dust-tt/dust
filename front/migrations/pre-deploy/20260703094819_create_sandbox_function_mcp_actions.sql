/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."sandbox_function_mcp_actions_id_seq"
	AS bigint
	INCREMENT BY 1
	MINVALUE 1 MAXVALUE 9223372036854775807
	START WITH 1 CACHE 1 NO CYCLE
;

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE "public"."sandbox_function_mcp_actions" (
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"sandboxFunctionInvocationId" bigint NOT NULL,
	"mcpServerViewId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"id" bigint DEFAULT nextval('sandbox_function_mcp_actions_id_seq'::regclass) NOT NULL,
	"executionDurationMs" integer,
	"toolName" character varying(255) NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"toolConfiguration" jsonb NOT NULL,
	"status" character varying(64) NOT NULL,
	"outputGcsPath" text
);

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_function_mcp_actions" ADD CONSTRAINT "sandbox_function_mcp_actions_mcpServerViewId_fkey" FOREIGN KEY ("mcpServerViewId") REFERENCES mcp_server_views(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_function_mcp_actions" VALIDATE CONSTRAINT "sandbox_function_mcp_actions_mcpServerViewId_fkey";

/*
Statement 4
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_function_mcp_actions" ADD CONSTRAINT "sandbox_function_mcp_actions_sandboxFunctionInvocationId_fkey" FOREIGN KEY ("sandboxFunctionInvocationId") REFERENCES sandbox_function_invocations(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 5
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_function_mcp_actions" VALIDATE CONSTRAINT "sandbox_function_mcp_actions_sandboxFunctionInvocationId_fkey";

/*
Statement 6
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_function_mcp_actions" ADD CONSTRAINT "sandbox_function_mcp_actions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 7
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_function_mcp_actions" VALIDATE CONSTRAINT "sandbox_function_mcp_actions_workspaceId_fkey";

/*
Statement 8
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY sandbox_function_mcp_actions_pkey ON public.sandbox_function_mcp_actions USING btree (id);

/*
Statement 9
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_function_mcp_actions" ADD CONSTRAINT "sandbox_function_mcp_actions_pkey" PRIMARY KEY USING INDEX "sandbox_function_mcp_actions_pkey";

/*
Statement 10
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY sandbox_function_mcp_actions_workspace_invocation ON public.sandbox_function_mcp_actions USING btree ("workspaceId", "sandboxFunctionInvocationId");

/*
Statement 11
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY sandbox_function_mcp_actions_mcp_server_view_id ON public.sandbox_function_mcp_actions USING btree ("mcpServerViewId");

/*
Statement 12
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY sandbox_function_mcp_actions_sandbox_function_invocation_id ON public.sandbox_function_mcp_actions USING btree ("sandboxFunctionInvocationId");

/*
Statement 13
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."sandbox_function_mcp_actions_id_seq" OWNED BY "public"."sandbox_function_mcp_actions"."id";

/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."sandbox_function_invocations_id_seq"
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
CREATE TABLE "public"."sandbox_function_invocations" (
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"sandboxFunctionId" bigint NOT NULL,
	"status" character varying(64) NOT NULL,
	"workspaceId" bigint NOT NULL,
	"id" bigint DEFAULT nextval('sandbox_function_invocations_id_seq'::regclass) NOT NULL
);

/*
Statement 2
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY sandbox_function_invocations_pkey ON public.sandbox_function_invocations USING btree (id);

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_function_invocations" ADD CONSTRAINT "sandbox_function_invocations_pkey" PRIMARY KEY USING INDEX "sandbox_function_invocations_pkey";

/*
Statement 4
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY sandbox_function_invocations_sandbox_function_id ON public.sandbox_function_invocations USING btree ("sandboxFunctionId");

/*
Statement 5
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."sandbox_function_invocations_id_seq" OWNED BY "public"."sandbox_function_invocations"."id";

/*
Statement 6
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_function_invocations" ADD CONSTRAINT "sandbox_function_invocations_sandboxFunctionId_fkey" FOREIGN KEY ("sandboxFunctionId") REFERENCES sandbox_functions(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 7
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_function_invocations" VALIDATE CONSTRAINT "sandbox_function_invocations_sandboxFunctionId_fkey";

/*
Statement 8
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_function_invocations" ADD CONSTRAINT "sandbox_function_invocations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 9
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_function_invocations" VALIDATE CONSTRAINT "sandbox_function_invocations_workspaceId_fkey";

/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."sandbox_functions_id_seq"
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
CREATE TABLE "public"."sandbox_functions" (
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"podId" bigint NOT NULL,
	"fileId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"id" bigint DEFAULT nextval('sandbox_functions_id_seq'::regclass) NOT NULL,
	"inputSchema" jsonb NOT NULL,
	"outputSchema" jsonb NOT NULL
);

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_functions" ADD CONSTRAINT "sandbox_functions_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES files(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_functions" VALIDATE CONSTRAINT "sandbox_functions_fileId_fkey";

/*
Statement 4
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY sandbox_functions_pkey ON public.sandbox_functions USING btree (id);

/*
Statement 5
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_functions" ADD CONSTRAINT "sandbox_functions_pkey" PRIMARY KEY USING INDEX "sandbox_functions_pkey";

/*
Statement 6
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY sandbox_functions_file_id ON public.sandbox_functions USING btree ("fileId");

/*
Statement 7
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY sandbox_functions_pod_id ON public.sandbox_functions USING btree ("podId");

/*
Statement 8
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY sandbox_functions_workspace_id_pod_id_file_id ON public.sandbox_functions USING btree ("workspaceId", "podId", "fileId");

/*
Statement 9
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."sandbox_functions_id_seq" OWNED BY "public"."sandbox_functions"."id";

/*
Statement 10
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_functions" ADD CONSTRAINT "sandbox_functions_podId_fkey" FOREIGN KEY ("podId") REFERENCES vaults(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 11
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_functions" VALIDATE CONSTRAINT "sandbox_functions_podId_fkey";

/*
Statement 12
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_functions" ADD CONSTRAINT "sandbox_functions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 13
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_functions" VALIDATE CONSTRAINT "sandbox_functions_workspaceId_fkey";

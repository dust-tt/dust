/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."pod_endpoints_id_seq"
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
CREATE TABLE "public"."pod_endpoints" (
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"podId" bigint NOT NULL,
	"fileId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"id" bigint DEFAULT nextval('pod_endpoints_id_seq'::regclass) NOT NULL,
	"inputSchema" jsonb NOT NULL,
	"outputSchema" jsonb NOT NULL
);

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."pod_endpoints" ADD CONSTRAINT "pod_endpoints_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES files(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."pod_endpoints" VALIDATE CONSTRAINT "pod_endpoints_fileId_fkey";

/*
Statement 4
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY pod_endpoints_pkey ON public.pod_endpoints USING btree (id);

/*
Statement 5
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."pod_endpoints" ADD CONSTRAINT "pod_endpoints_pkey" PRIMARY KEY USING INDEX "pod_endpoints_pkey";

/*
Statement 6
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY pod_endpoints_file_id ON public.pod_endpoints USING btree ("fileId");

/*
Statement 7
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY pod_endpoints_pod_id ON public.pod_endpoints USING btree ("podId");

/*
Statement 8
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY pod_endpoints_workspace_id_pod_id_file_id ON public.pod_endpoints USING btree ("workspaceId", "podId", "fileId");

/*
Statement 9
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."pod_endpoints_id_seq" OWNED BY "public"."pod_endpoints"."id";

/*
Statement 10
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."pod_endpoints" ADD CONSTRAINT "pod_endpoints_podId_fkey" FOREIGN KEY ("podId") REFERENCES vaults(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 11
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."pod_endpoints" VALIDATE CONSTRAINT "pod_endpoints_podId_fkey";

/*
Statement 12
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."pod_endpoints" ADD CONSTRAINT "pod_endpoints_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 13
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."pod_endpoints" VALIDATE CONSTRAINT "pod_endpoints_workspaceId_fkey";

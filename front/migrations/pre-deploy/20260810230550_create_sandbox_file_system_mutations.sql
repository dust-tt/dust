/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."sandbox_file_system_mutations_id_seq"
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
CREATE TABLE "public"."sandbox_file_system_mutations" (
	"completedAt" timestamp with time zone,
	"updatedAt" timestamp with time zone NOT NULL,
	"sandboxId" bigint NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"id" bigint DEFAULT nextval('sandbox_file_system_mutations_id_seq'::regclass) NOT NULL,
	"workspaceId" bigint NOT NULL,
	"claimedAt" timestamp with time zone NOT NULL,
	"idempotencyKey" character varying(64) COLLATE "pg_catalog"."default" NOT NULL,
	"error" text COLLATE "pg_catalog"."default",
	"status" character varying(16) COLLATE "pg_catalog"."default" DEFAULT 'pending'::character varying NOT NULL,
	"claimedBy" character varying(64) COLLATE "pg_catalog"."default" NOT NULL,
	"requestHash" character varying(64) COLLATE "pg_catalog"."default" NOT NULL,
	"request" jsonb NOT NULL
);

/*
Statement 2
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY sandbox_file_system_mutations_pkey ON public.sandbox_file_system_mutations USING btree (id);

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_file_system_mutations" ADD CONSTRAINT "sandbox_file_system_mutations_pkey" PRIMARY KEY USING INDEX "sandbox_file_system_mutations_pkey";

/*
Statement 4
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY sandbox_fs_mutations_idempotency_idx ON public.sandbox_file_system_mutations USING btree ("workspaceId", "sandboxId", "idempotencyKey");

/*
Statement 5
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY sandbox_fs_mutations_sandbox_id_idx ON public.sandbox_file_system_mutations USING btree ("sandboxId");

/*
Statement 6
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY sandbox_fs_mutations_workspace_id_idx ON public.sandbox_file_system_mutations USING btree ("workspaceId");

/*
Statement 7
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."sandbox_file_system_mutations_id_seq" OWNED BY "public"."sandbox_file_system_mutations"."id";

/*
Statement 8
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_file_system_mutations" ADD CONSTRAINT "sandbox_file_system_mutations_sandboxId_fkey" FOREIGN KEY ("sandboxId") REFERENCES sandboxes(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;

/*
Statement 9
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_file_system_mutations" VALIDATE CONSTRAINT "sandbox_file_system_mutations_sandboxId_fkey";

/*
Statement 10
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_file_system_mutations" ADD CONSTRAINT "sandbox_file_system_mutations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 11
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_file_system_mutations" VALIDATE CONSTRAINT "sandbox_file_system_mutations_workspaceId_fkey";

/*
Statement 12
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY files_workspace_frame_bundle_root_idx ON public.files USING btree ("workspaceId", "contentType", ("useCaseMetadata" #>> '{frameBundleRootPath}')) WHERE ("useCaseMetadata" IS NOT NULL);

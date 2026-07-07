/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."pod_egress_policies_id_seq"
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
CREATE TABLE "public"."pod_egress_policies" (
	"workspaceId" bigint NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"spaceId" bigint NOT NULL,
	"id" bigint DEFAULT nextval('pod_egress_policies_id_seq'::regclass) NOT NULL,
	"allowed_domains" text[] COLLATE "pg_catalog"."default" DEFAULT '{}'::text[] NOT NULL
);

/*
Statement 2
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY pod_egress_policies_pkey ON public.pod_egress_policies USING btree (id);

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."pod_egress_policies" ADD CONSTRAINT "pod_egress_policies_pkey" PRIMARY KEY USING INDEX "pod_egress_policies_pkey";

/*
Statement 4
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY pod_egress_policies_space_idx ON public.pod_egress_policies USING btree ("spaceId");

/*
Statement 5
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY pod_egress_policies_workspace_id ON public.pod_egress_policies USING btree ("workspaceId");

/*
Statement 6
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."pod_egress_policies_id_seq" OWNED BY "public"."pod_egress_policies"."id";

/*
Statement 7
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."pod_egress_policies" ADD CONSTRAINT "pod_egress_policies_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES vaults(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 8
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."pod_egress_policies" VALIDATE CONSTRAINT "pod_egress_policies_spaceId_fkey";

/*
Statement 9
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."pod_egress_policies" ADD CONSTRAINT "pod_egress_policies_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 10
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."pod_egress_policies" VALIDATE CONSTRAINT "pod_egress_policies_workspaceId_fkey";

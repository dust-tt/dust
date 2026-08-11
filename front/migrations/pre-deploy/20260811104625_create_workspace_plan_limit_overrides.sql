/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."workspace_plan_limit_overrides_id_seq"
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
CREATE TABLE "public"."workspace_plan_limit_overrides" (
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"workspaceId" bigint NOT NULL,
	"id" bigint DEFAULT nextval('workspace_plan_limit_overrides_id_seq'::regclass) NOT NULL,
	"maxUsersInWorkspace" integer,
	"maxFreeUsersInWorkspace" integer,
	"maxLifetimeFreeUsersInWorkspace" integer
);

/*
Statement 2
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY workspace_plan_limit_overrides_pkey ON public.workspace_plan_limit_overrides USING btree (id);

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."workspace_plan_limit_overrides" ADD CONSTRAINT "workspace_plan_limit_overrides_pkey" PRIMARY KEY USING INDEX "workspace_plan_limit_overrides_pkey";

/*
Statement 4
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY workspace_plan_limit_overrides_workspace_id ON public.workspace_plan_limit_overrides USING btree ("workspaceId");

/*
Statement 5
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."workspace_plan_limit_overrides_id_seq" OWNED BY "public"."workspace_plan_limit_overrides"."id";

/*
Statement 6
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."workspace_plan_limit_overrides" ADD CONSTRAINT "workspace_plan_limit_overrides_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 7
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."workspace_plan_limit_overrides" VALIDATE CONSTRAINT "workspace_plan_limit_overrides_workspaceId_fkey";

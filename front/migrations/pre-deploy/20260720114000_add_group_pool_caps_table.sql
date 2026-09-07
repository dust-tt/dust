/*
Pre-deploy: create the group_pool_caps table.

Moves the per-group usage spend limit (groups."poolCapAwuCredits") to a
dedicated table.

The backfill at the end copies existing caps from the groups column so the
new code sees them immediately at deploy time.
 */

/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."group_pool_caps_id_seq"
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
CREATE TABLE "public"."group_pool_caps" (
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"workspaceId" bigint NOT NULL,
	"id" bigint DEFAULT nextval('group_pool_caps_id_seq'::regclass) NOT NULL,
	"groupId" bigint NOT NULL,
	"poolCapAwuCredits" integer NOT NULL
);

/*
Statement 2
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY group_pool_caps_pkey ON public.group_pool_caps USING btree (id);

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."group_pool_caps" ADD CONSTRAINT "group_pool_caps_pkey" PRIMARY KEY USING INDEX "group_pool_caps_pkey";

/*
Statement 4
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY group_pool_caps_group_id ON public.group_pool_caps USING btree ("groupId");

/*
Statement 5
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY group_pool_caps_workspace_id ON public.group_pool_caps USING btree ("workspaceId");

/*
Statement 6
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."group_pool_caps_id_seq" OWNED BY "public"."group_pool_caps"."id";

/*
Statement 7
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."group_pool_caps" ADD CONSTRAINT "group_pool_caps_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 8
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."group_pool_caps" VALIDATE CONSTRAINT "group_pool_caps_workspaceId_fkey";

/*
Statement 9
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."group_pool_caps" ADD CONSTRAINT "group_pool_caps_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES groups(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 10
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."group_pool_caps" VALIDATE CONSTRAINT "group_pool_caps_groupId_fkey";

/*
Statement 11
Backfill existing caps from the groups column.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
INSERT INTO "public"."group_pool_caps" ("createdAt", "updatedAt", "workspaceId", "groupId", "poolCapAwuCredits")
SELECT now(), now(), "workspaceId", "id", "poolCapAwuCredits"
FROM "public"."groups"
WHERE "poolCapAwuCredits" IS NOT NULL
ON CONFLICT ("groupId") DO NOTHING;

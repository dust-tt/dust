/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."skill_references_id_seq"
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
CREATE TABLE "public"."skill_references" (
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"parentSkillId" bigint NOT NULL,
	"childSkillId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"id" bigint DEFAULT nextval('skill_references_id_seq'::regclass) NOT NULL
);

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_references" ADD CONSTRAINT "skill_references_childSkillId_fkey" FOREIGN KEY ("childSkillId") REFERENCES skill_configurations(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_references" VALIDATE CONSTRAINT "skill_references_childSkillId_fkey";

/*
Statement 4
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_references" ADD CONSTRAINT "skill_references_parentSkillId_fkey" FOREIGN KEY ("parentSkillId") REFERENCES skill_configurations(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 5
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_references" VALIDATE CONSTRAINT "skill_references_parentSkillId_fkey";

/*
Statement 6
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY skill_references_pkey ON public.skill_references USING btree (id);

/*
Statement 7
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_references" ADD CONSTRAINT "skill_references_pkey" PRIMARY KEY USING INDEX "skill_references_pkey";

/*
Statement 8
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY skill_references_child_skill_id_idx ON public.skill_references USING btree ("childSkillId");

/*
Statement 9
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY skill_references_parent_skill_id_idx ON public.skill_references USING btree ("parentSkillId");

/*
Statement 10
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY skill_references_workspace_parent_child_idx ON public.skill_references USING btree ("workspaceId", "parentSkillId", "childSkillId");

/*
Statement 11
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."skill_references_id_seq" OWNED BY "public"."skill_references"."id";

/*
Statement 12
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_references" ADD CONSTRAINT "skill_references_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 13
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_references" VALIDATE CONSTRAINT "skill_references_workspaceId_fkey";

/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."project_default_skills_id_seq"
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
CREATE TABLE "public"."project_default_skills" (
	"id" bigint DEFAULT nextval('project_default_skills_id_seq'::regclass) NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"projectId" bigint NOT NULL,
	"skillConfigurationId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL
);

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_default_skills" ADD CONSTRAINT "project_default_skills_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES project_metadata(id) ON UPDATE CASCADE NOT VALID;

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_default_skills" VALIDATE CONSTRAINT "project_default_skills_projectId_fkey";

/*
Statement 4
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY project_default_skills_pkey ON public.project_default_skills USING btree (id);

/*
Statement 5
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_default_skills" ADD CONSTRAINT "project_default_skills_pkey" PRIMARY KEY USING INDEX "project_default_skills_pkey";

/*
Statement 6
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY project_default_skills_unique ON public.project_default_skills USING btree ("workspaceId", "projectId", "skillConfigurationId");

/*
Statement 7
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY project_default_skills_skill_configuration_id ON public.project_default_skills USING btree ("skillConfigurationId");

/*
Statement 8
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."project_default_skills_id_seq" OWNED BY "public"."project_default_skills"."id";

/*
Statement 9
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_default_skills" ADD CONSTRAINT "project_default_skills_skillConfigurationId_fkey" FOREIGN KEY ("skillConfigurationId") REFERENCES skill_configurations(id) ON UPDATE CASCADE NOT VALID;

/*
Statement 10
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_default_skills" VALIDATE CONSTRAINT "project_default_skills_skillConfigurationId_fkey";

/*
Statement 11
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_default_skills" ADD CONSTRAINT "project_default_skills_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 12
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_default_skills" VALIDATE CONSTRAINT "project_default_skills_workspaceId_fkey";

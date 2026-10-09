/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."agent_suggested_prompts_id_seq"
	AS bigint
	INCREMENT BY 1
	MINVALUE 1 MAXVALUE 9223372036854775807
	START WITH 1 CACHE 1 NO CYCLE
;

/*
Statement 11
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE "public"."agent_suggested_prompts" (
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"workspaceId" bigint NOT NULL,
	"id" bigint DEFAULT nextval('agent_suggested_prompts_id_seq'::regclass) NOT NULL,
	"agentConfigurationId" character varying(255) COLLATE "pg_catalog"."default" NOT NULL,
	"prompts" character varying(256)[] COLLATE "pg_catalog"."default" NOT NULL
);

/*
Statement 12
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY agent_suggested_prompts_pkey ON public.agent_suggested_prompts USING btree (id);

/*
Statement 13
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_suggested_prompts" ADD CONSTRAINT "agent_suggested_prompts_pkey" PRIMARY KEY USING INDEX "agent_suggested_prompts_pkey";

/*
Statement 14
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY agent_suggested_prompts_workspace_agent_idx ON public.agent_suggested_prompts USING btree ("workspaceId", "agentConfigurationId");

/*
Statement 15
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."agent_suggested_prompts_id_seq" OWNED BY "public"."agent_suggested_prompts"."id";

/*
Statement 28
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_suggested_prompts" ADD CONSTRAINT "agent_suggested_prompts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 29
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_suggested_prompts" VALIDATE CONSTRAINT "agent_suggested_prompts_workspaceId_fkey";

/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."activation_recommendations_id_seq"
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
CREATE TABLE "public"."activation_recommendations" (
	"createdAt" timestamp with time zone NOT NULL DEFAULT NOW(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT NOW(),
	"workspaceId" bigint NOT NULL,
	"userId" bigint NOT NULL,
	"status" character varying(50) NOT NULL,
	"content" character varying(4096) NOT NULL,
	"rationale" character varying(4096) NOT NULL,
	"conversationId" bigint,
	"createdSkillId" bigint,
	"createdTriggerId" bigint,
	"id" bigint DEFAULT nextval('activation_recommendations_id_seq'::regclass) NOT NULL
);

/*
Statement 2
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY activation_recommendations_pkey ON public.activation_recommendations USING btree (id);

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" ADD CONSTRAINT "activation_recommendations_pkey" PRIMARY KEY USING INDEX "activation_recommendations_pkey";

/*
Statement 4
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY "idx_activation_recommendations_user" ON public.activation_recommendations USING btree ("userId");

/*
Statement 5
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY "activation_recommendations_workspace_id" ON public.activation_recommendations USING btree ("workspaceId");

/*
Statement 6
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY "activation_recommendations_conversation_id" ON public.activation_recommendations USING btree ("conversationId");

/*
Statement 7
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY "activation_recommendations_created_skill_id" ON public.activation_recommendations USING btree ("createdSkillId");

/*
Statement 8
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY "activation_recommendations_created_trigger_id" ON public.activation_recommendations USING btree ("createdTriggerId");

/*
Statement 9
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."activation_recommendations_id_seq" OWNED BY "public"."activation_recommendations"."id";

/*
Statement 10
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" ADD CONSTRAINT "activation_recommendations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 11
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" VALIDATE CONSTRAINT "activation_recommendations_workspaceId_fkey";

/*
Statement 12
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" ADD CONSTRAINT "activation_recommendations_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 13
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" VALIDATE CONSTRAINT "activation_recommendations_userId_fkey";

/*
Statement 14
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" ADD CONSTRAINT "activation_recommendations_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES conversations(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

/*
Statement 15
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" VALIDATE CONSTRAINT "activation_recommendations_conversationId_fkey";

/*
Statement 16
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" ADD CONSTRAINT "activation_recommendations_createdSkillId_fkey" FOREIGN KEY ("createdSkillId") REFERENCES skill_configurations(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

/*
Statement 17
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" VALIDATE CONSTRAINT "activation_recommendations_createdSkillId_fkey";

/*
Statement 18
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" ADD CONSTRAINT "activation_recommendations_createdTriggerId_fkey" FOREIGN KEY ("createdTriggerId") REFERENCES triggers(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

/*
Statement 19
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" VALIDATE CONSTRAINT "activation_recommendations_createdTriggerId_fkey";

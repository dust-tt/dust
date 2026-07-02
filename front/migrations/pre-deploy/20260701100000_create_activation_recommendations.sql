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
	"status" character varying(50) NOT NULL DEFAULT 'pending',
	"content" text NOT NULL,
	"rationale" text NOT NULL,
	"conversationModelId" bigint,
	"skillModelId" bigint,
	"triggerModelId" bigint,
	"id" bigint DEFAULT nextval('activation_recommendations_id_seq'::regclass) NOT NULL
);

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations"
	ADD CONSTRAINT "activation_recommendations_status_check"
	CHECK (status IN ('pending', 'accepted', 'rejected', 'saved', 'recurring'));

/*
Statement 3
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY activation_recommendations_pkey ON public.activation_recommendations USING btree (id);

/*
Statement 4
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" ADD CONSTRAINT "activation_recommendations_pkey" PRIMARY KEY USING INDEX "activation_recommendations_pkey";

/*
Statement 5
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY "idx_activation_recommendations_user" ON public.activation_recommendations USING btree ("userId");

/*
Statement 6
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY "activation_recommendations_workspace_id" ON public.activation_recommendations USING btree ("workspaceId");

/*
Statement 7
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY "activation_recommendations_conversation_model_id" ON public.activation_recommendations USING btree ("conversationModelId");

/*
Statement 8
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY "activation_recommendations_skill_model_id" ON public.activation_recommendations USING btree ("skillModelId");

/*
Statement 9
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY "activation_recommendations_trigger_model_id" ON public.activation_recommendations USING btree ("triggerModelId");

/*
Statement 10
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."activation_recommendations_id_seq" OWNED BY "public"."activation_recommendations"."id";

/*
Statement 11
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" ADD CONSTRAINT "activation_recommendations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 12
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" VALIDATE CONSTRAINT "activation_recommendations_workspaceId_fkey";

/*
Statement 13
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" ADD CONSTRAINT "activation_recommendations_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 14
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" VALIDATE CONSTRAINT "activation_recommendations_userId_fkey";

/*
Statement 15
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" ADD CONSTRAINT "activation_recommendations_conversationModelId_fkey" FOREIGN KEY ("conversationModelId") REFERENCES conversations(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

/*
Statement 16
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" VALIDATE CONSTRAINT "activation_recommendations_conversationModelId_fkey";

/*
Statement 17
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" ADD CONSTRAINT "activation_recommendations_skillModelId_fkey" FOREIGN KEY ("skillModelId") REFERENCES skill_configurations(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

/*
Statement 18
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" VALIDATE CONSTRAINT "activation_recommendations_skillModelId_fkey";

/*
Statement 19
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" ADD CONSTRAINT "activation_recommendations_triggerModelId_fkey" FOREIGN KEY ("triggerModelId") REFERENCES triggers(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

/*
Statement 20
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" VALIDATE CONSTRAINT "activation_recommendations_triggerModelId_fkey";

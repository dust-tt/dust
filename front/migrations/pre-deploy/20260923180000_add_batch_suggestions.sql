/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE "public"."batch_suggestions" (
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "title" character varying(255) COLLATE "pg_catalog"."default",
    "analysis" character varying(255) COLLATE "pg_catalog"."default",
    "state" character varying(255) COLLATE "pg_catalog"."default" DEFAULT 'pending'::character varying NOT NULL,
    "workspaceId" bigint NOT NULL,
    "id" bigserial PRIMARY KEY,
    "sourceConversationModelId" bigint,
    CONSTRAINT "batch_suggestions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT "batch_suggestions_sourceConversationModelId_fkey" FOREIGN KEY ("sourceConversationModelId") REFERENCES conversations(id) ON UPDATE CASCADE ON DELETE SET NULL
);

/*
Statement 1
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY batch_suggestions_workspace_id ON public.batch_suggestions USING btree ("workspaceId");

/*
Statement 2
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY batch_suggestions_source_conversation_model_id ON public.batch_suggestions USING btree ("sourceConversationModelId") WHERE ("sourceConversationModelId" IS NOT NULL);

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_suggestions" ADD COLUMN "batchId" bigint;

/*
Statement 4
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY agent_suggestions_workspace_batch_id ON public.agent_suggestions USING btree ("workspaceId", "batchId") WHERE ("batchId" IS NOT NULL);

/*
Statement 5
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_suggestions" ADD CONSTRAINT "agent_suggestions_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES batch_suggestions(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 6
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_suggestions" VALIDATE CONSTRAINT "agent_suggestions_batchId_fkey";

/*
Statement 7
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_suggestions" ADD COLUMN "batchId" bigint;

/*
Statement 8
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY idx_skill_suggestions_workspace_batch_id ON public.skill_suggestions USING btree ("workspaceId", "batchId") WHERE ("batchId" IS NOT NULL);

/*
Statement 9
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_suggestions" ADD CONSTRAINT "skill_suggestions_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES batch_suggestions(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 10
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_suggestions" VALIDATE CONSTRAINT "skill_suggestions_batchId_fkey";

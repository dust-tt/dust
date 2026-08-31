/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_metadata" ADD COLUMN "isApp" boolean DEFAULT false NOT NULL;

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_metadata" ADD COLUMN "appConversationId" character varying(255);

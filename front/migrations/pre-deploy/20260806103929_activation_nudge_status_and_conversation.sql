/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_pods" ADD COLUMN "nudgesDisabledAt" timestamp with time zone;

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" DROP CONSTRAINT "activation_nudges_triggerId_fkey";

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" ADD COLUMN "conversationId" bigint;

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" ADD COLUMN "errorMessage" text COLLATE "pg_catalog"."default";

/*
Statement 4
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" ADD COLUMN "status" character varying(255) COLLATE "pg_catalog"."default" DEFAULT 'posted'::character varying NOT NULL;

/*
Statement 5
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" ALTER COLUMN "triggerId" DROP NOT NULL;

/*
Statement 6
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" ADD CONSTRAINT "activation_nudges_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES conversations(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

/*
Statement 7
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" VALIDATE CONSTRAINT "activation_nudges_conversationId_fkey";

/*
Statement 8
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY activation_nudges_conversation_id ON public.activation_nudges USING btree ("conversationId");

/*
Statement 9
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" ADD CONSTRAINT "activation_nudges_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES triggers(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

/*
Statement 10
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" VALIDATE CONSTRAINT "activation_nudges_triggerId_fkey";

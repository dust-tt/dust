/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_pods" ADD COLUMN "compactUIView" boolean DEFAULT false NOT NULL;

SET
  SESSION statement_timeout = 3000;

SET
  SESSION lock_timeout = 3000;

ALTER TABLE "public"."run_usages"
ADD COLUMN "reasoningEffort" character varying(255) DEFAULT NULL;

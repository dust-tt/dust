SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_suggestions" ADD COLUMN "source" character varying(255) DEFAULT 'sidekick' NOT NULL;

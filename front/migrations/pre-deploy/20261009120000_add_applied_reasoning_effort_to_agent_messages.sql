SET
  SESSION statement_timeout = 3000;

SET
  SESSION lock_timeout = 3000;

ALTER TABLE "public"."agent_messages"
ADD COLUMN "appliedReasoningEffort" character varying(255) DEFAULT NULL;

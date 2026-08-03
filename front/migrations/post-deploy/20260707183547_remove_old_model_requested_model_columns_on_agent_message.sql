SET
  SESSION statement_timeout = 3000;

SET
  SESSION lock_timeout = 3000;

ALTER TABLE "public"."agent_messages"
DROP COLUMN "requestedModelId";

ALTER TABLE "public"."agent_messages"
DROP COLUMN "requestedProviderId";

ALTER TABLE "public"."agent_messages"
DROP COLUMN "requestedReasoningEffort";
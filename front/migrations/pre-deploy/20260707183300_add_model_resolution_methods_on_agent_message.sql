SET
  SESSION statement_timeout = 3000;

SET
  SESSION lock_timeout = 3000;

ALTER TABLE "public"."agent_messages"
ADD COLUMN "modelResolutionMethod" character varying(255) DEFAULT NULL;

ALTER TABLE "public"."agent_messages"
ADD COLUMN "resolvedModelId" character varying(255) DEFAULT NULL;

ALTER TABLE "public"."agent_messages"
ADD COLUMN "resolvedProviderId" character varying(255) DEFAULT NULL;

ALTER TABLE "public"."agent_messages"
ADD COLUMN "resolvedReasoningEffort" character varying(255) DEFAULT NULL;
SET
  SESSION statement_timeout = 3000;

SET
  SESSION lock_timeout = 3000;

ALTER TABLE "public"."user_messages"
ADD COLUMN "requestedModelId" character varying(255) DEFAULT NULL;

ALTER TABLE "public"."user_messages"
ADD COLUMN "requestedProviderId" character varying(255) DEFAULT NULL;

ALTER TABLE "public"."user_messages"
ADD COLUMN "requestedReasoningEffort" character varying(255) DEFAULT NULL;
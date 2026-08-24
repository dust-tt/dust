SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_messages" ADD COLUMN "stoppedBySmoothShutdown" boolean;
ALTER TABLE "public"."agent_messages" ADD COLUMN "pausedAtWorkflowAlertThreshold" boolean;
ALTER TABLE "public"."agent_messages" ADD COLUMN "pausedAtWorkflowAlertThresholdStep" integer;
ALTER TABLE "public"."agent_messages" ADD COLUMN "workflowAlertThresholdAcknowledged" boolean;

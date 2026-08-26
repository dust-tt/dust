ALTER TABLE "agent_messages"
  ADD COLUMN "consumptionRolloutMode" character varying(16);

ALTER TABLE "agent_message_consumption_events"
  ADD COLUMN "consumptionMode" character varying(16);

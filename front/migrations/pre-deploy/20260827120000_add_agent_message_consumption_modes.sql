SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "agent_message_consumption_events"
  ADD COLUMN "consumptionMode" character varying(16);

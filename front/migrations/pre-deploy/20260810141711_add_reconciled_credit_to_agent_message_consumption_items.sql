SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_message_consumption_items" ADD COLUMN "reconciledCreditAmountMicro" bigint;

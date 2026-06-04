-- Migration created on Jun 4, 2026
-- Add "costCredits" to agent_messages: per-message credit usage (in AWU
-- credits) consumed to produce the message. Nullable so existing rows and
-- messages produced before tracking remain unset.
ALTER TABLE "public"."agent_messages" ADD COLUMN "costCredits" INTEGER;

-- Migration created on Jul 10, 2024
ALTER TABLE
    "public"."agent_messages" DROP COLUMN "content";

ALTER TABLE
    "public"."agent_messages" DROP COLUMN "chainOfThoughts";
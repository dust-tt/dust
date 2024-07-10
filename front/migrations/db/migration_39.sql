-- Migration created on Jul 10, 2024
ALTER TABLE
    "public"."agent_messages"
ALTER COLUMN
    "chainOfThoughts" DROP NOT NULL;
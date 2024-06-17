-- Migration created on Jun 11, 2024
ALTER TABLE
    "public"."agent_messages"
ADD
    COLUMN "chainOfThoughts" TEXT [] NOT NULL DEFAULT ARRAY [] :: TEXT [];
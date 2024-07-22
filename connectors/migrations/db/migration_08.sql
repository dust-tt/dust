-- Migration created on Jul 22, 2024
ALTER TABLE
    "public"."github_connector_states"
ADD
    COLUMN "accountId" INTEGER;
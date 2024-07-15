-- Migration created on Jul 15, 2024
ALTER TABLE
    "public"."agent_configurations"
ADD
    COLUMN "maxStepsPerRun" INTEGER;
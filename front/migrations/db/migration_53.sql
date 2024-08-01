-- Migration created on Jul 04, 2024
ALTER TABLE
    "public"."agent_configurations"
ADD
    COLUMN "visualizationEnabled" BOOLEAN NOT NULL DEFAULT false;
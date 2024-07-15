UPDATE
    agent_configurations
SET
    "maxStepsPerRun" = "maxToolsUsePerRun"
WHERE
    "maxStepsPerRun" IS NULL;
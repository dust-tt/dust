UPDATE
    agent_configurations
SET
    "maxToolsUsePerRun" = 3
WHERE
    "maxToolsUsePerRun" < 3;
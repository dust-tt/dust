UPDATE github_connector_states
SET "installationId" = (
    SELECT "connectionId"
    FROM connectors
    WHERE connectors.id = github_connector_states."connectorId"
);

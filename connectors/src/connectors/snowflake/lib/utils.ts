import type { ConnectionCredentials, ModelId, Result } from "@dust-tt/types";
import { Err, getConnectionCredentials, Ok } from "@dust-tt/types";

import { apiConfig } from "@connectors/lib/api/config";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

// Helper functions to get connector and credentials
export const getConnector = async ({
  connectorId,
  logger,
}: {
  connectorId: ModelId;
  logger: Logger;
}): Promise<
  Result<
    {
      connector: ConnectorResource;
    },
    Error
  >
> => {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "Connector not found");
    return new Err(new Error("Connector not found"));
  }
  return new Ok({ connector });
};

export const getCredentials = async ({
  credentialsId,
  logger,
}: {
  credentialsId: string;
  logger: Logger;
}): Promise<
  Result<
    {
      credentials: ConnectionCredentials;
    },
    Error
  >
> => {
  const credentialsRes = await getConnectionCredentials({
    config: apiConfig.getOAuthAPIConfig(),
    logger,
    credentialsId,
  });
  if (credentialsRes.isErr()) {
    logger.error({ credentialsId }, "Failed to retrieve credentials");
    return new Err(Error("Failed to retrieve credentials"));
  }
  return new Ok({
    credentials: credentialsRes.value.credential.content,
  });
};

export const getConnectorAndCredentials = async ({
  connectorId,
  logger,
}: {
  connectorId: ModelId;
  logger: Logger;
}): Promise<
  Result<
    {
      connector: ConnectorResource;
      credentials: ConnectionCredentials;
    },
    Error
  >
> => {
  const connectorRes = await getConnector({ connectorId, logger });
  if (connectorRes.isErr()) {
    return connectorRes;
  }
  const connector = connectorRes.value.connector;

  const credentialsRes = await getConnectionCredentials({
    config: apiConfig.getOAuthAPIConfig(),
    logger,
    credentialsId: connector.connectionId,
  });
  if (credentialsRes.isErr()) {
    logger.error({ connectorId }, "Failed to retrieve credentials");
    return new Err(Error("Failed to retrieve credentials"));
  }
  return new Ok({
    connector,
    credentials: credentialsRes.value.credential.content,
  });
};

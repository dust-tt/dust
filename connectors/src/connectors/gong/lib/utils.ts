import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import { GongClient } from "@connectors/connectors/gong/lib/gong_api";
import { apiConfig } from "@connectors/lib/api/config";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { GongConfigurationResource } from "@connectors/resources/gong_resources";
import type { ModelId } from "@connectors/types";
import { getOAuthConnectionAccessToken } from "@connectors/types";

export async function fetchGongConnector({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<ConnectorResource> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "[Gong] Connector not found.");
    throw new Error("[Gong] Connector not found.");
  }
  return connector;
}

export async function fetchGongConfiguration(
  connector: ConnectorResource
): Promise<GongConfigurationResource> {
  const configuration =
    await GongConfigurationResource.fetchByConnector(connector);
  if (!configuration) {
    logger.error(
      { connectorId: connector.id },
      "[Gong] Configuration not found."
    );
    throw new Error("[Gong] Configuration not found.");
  }
  return configuration;
}

async function getGongAccessToken(
  connector: ConnectorResource
): Promise<Result<string, Error>> {
  const tokenResult = await getOAuthConnectionAccessToken({
    config: apiConfig.getOAuthAPIConfig(),
    logger,
    provider: "gong",
    connectionId: connector.connectionId,
  });
  if (tokenResult.isErr()) {
    logger.error(
      { connectionId: connector.connectionId, error: tokenResult.error },
      "Error retrieving Gong access token."
    );

    return new Err(new Error(tokenResult.error.message));
  }

  return new Ok(tokenResult.value.access_token);
}

export async function getGongClient(connector: ConnectorResource) {
  const accessTokenResult = await getGongAccessToken(connector);
  if (accessTokenResult.isErr()) {
    throw accessTokenResult.error;
  }

  return new GongClient(accessTokenResult.value, connector.id);
}

import { GongClient } from "@connectors/connectors/gong/lib/gong_api";
import { getOAuthConnectionAccessTokenWithThrow } from "@connectors/lib/oauth";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { GongConfigurationResource } from "@connectors/resources/gong_resources";
import type { ModelId } from "@connectors/types";

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

export async function getGongClient(connector: ConnectorResource) {
  const { access_token } = await getOAuthConnectionAccessTokenWithThrow({
    logger,
    provider: "gong",
    connectionId: connector.connectionId,
  });

  return new GongClient(access_token, connector.id);
}

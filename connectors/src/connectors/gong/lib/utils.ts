import type { ModelId } from "@dust-tt/types";

import { GongClient } from "@connectors/connectors/gong/lib/gong_api";
import { getGongAccessToken } from "@connectors/connectors/gong/lib/gong_api";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { GongConfigurationResource } from "@connectors/resources/gong_resources";

export async function fetchGongConnector({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<ConnectorResource> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
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
    throw new Error("[Gong] Configuration not found.");
  }
  return configuration;
}

export async function getGongClient(connector: ConnectorResource) {
  const accessTokenResult = await getGongAccessToken(connector);
  if (accessTokenResult.isErr()) {
    throw accessTokenResult.error;
  }

  return new GongClient(accessTokenResult.value, connector.id);
}

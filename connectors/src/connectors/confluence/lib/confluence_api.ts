import { ModelId } from "@dust-tt/types";

import { confluenceConfig } from "@connectors/connectors/confluence/lib/config";
import { ConfluenceClient } from "@connectors/connectors/confluence/lib/confluence_client";
import { Connector } from "@connectors/lib/models";
import { ConfluenceConfiguration } from "@connectors/lib/models/confluence";
import { getConnectionFromNango } from "@connectors/lib/nango_helpers";

const { getRequiredNangoConfluenceConnectorId } = confluenceConfig;

export async function getConfluenceCloudInformation(accessToken: string) {
  const client = new ConfluenceClient(accessToken);

  try {
    return await client.getCloudInformation();
  } catch (err) {
    return null;
  }
}

export async function fetchConfluenceConfiguration(connectorId: ModelId) {
  const confluenceConfig = await ConfluenceConfiguration.findOne({
    where: {
      connectorId: connectorId,
    },
  });

  return confluenceConfig;
}

export async function listConfluenceSpaces(
  connector: Connector,
  confluenceConfig?: ConfluenceConfiguration
) {
  const { id: connectorId, connectionId } = connector;

  const config =
    confluenceConfig ?? (await fetchConfluenceConfiguration(connectorId));
  const confluenceConnection = await getConnectionFromNango({
    connectionId,
    integrationId: getRequiredNangoConfluenceConnectorId(),
    useCache: false,
  });

  const { access_token: confluenceAccessToken } =
    confluenceConnection.credentials;

  const client = new ConfluenceClient(confluenceAccessToken, {
    cloudId: config?.cloudId,
  });

  return client.getGlobalSpaces();
}

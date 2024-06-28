import type { ModelId } from "@dust-tt/types";

import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config";
import { MicrosoftRootResource } from "@connectors/resources/microsoft_resource";
import { getMessages } from "@connectors/connectors/microsoft/lib/graph_api";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { getClient } from "@connectors/connectors/microsoft";

export async function fullSyncActivity({
  connectorId,
  dataSourceConfig,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
}): Promise<void> {
  const connector = await ConnectorResource.fetchById(connectorId);

  if (!connector) {
    throw new Error(`Connector with id ${connectorId} not found`);
  }

  const resources = await MicrosoftRootResource.listRootsByConnectorId(
    connectorId
  );

  const client = await getClient(connector.connectionId);

  const teamResources = resources.filter((resource) =>
    ["channel"].includes(resource.nodeType)
  );

  const channel = teamResources[0];
  // get a message
  // const message = getMessages(client, channel);

  logger.info(
    `To implement: full sync for connector ${connectorId} with config ${JSON.stringify(
      dataSourceConfig
    )}`
  );
}

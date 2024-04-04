import type { ModelId } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import { terminateAllWorkflowsForConnectorId } from "@connectors/lib/temporal";
import { ConnectorResource } from "@connectors/resources/connector_resource";

export async function pauseGoogleDriveWebhooks(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector not found with id ${connectorId}`));
  }
  await connector.markAsPaused();
  await terminateAllWorkflowsForConnectorId(connectorId);
  return new Ok(undefined);
}

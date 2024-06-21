import type { ModelId, Result } from "@dust-tt/types";
import { Err } from "@dust-tt/types";

import { ConnectorResource } from "@connectors/resources/connector_resource";

export async function launchMicrosoftFullSyncWorkflow(
  connectorId: ModelId
): Promise<Result<string, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  throw Error("Not implemented");
}

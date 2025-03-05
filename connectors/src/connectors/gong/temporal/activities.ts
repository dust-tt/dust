import type { ModelId } from "@dust-tt/types";

import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import { ConnectorResource } from "@connectors/resources/connector_resource";

async function fetchGongConnector(
  connectorId: ModelId
): Promise<ConnectorResource> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Gong] Connector not found.");
  }
  return connector;
}

export async function gongSaveStartSyncActivity(connectorId: ModelId) {
  const connector = await fetchGongConnector(connectorId);

  const result = await syncStarted(connector.id);
  if (result.isErr()) {
    throw result.error;
  }
}

export async function gongSaveSyncSuccessActivity(connectorId: ModelId) {
  const connector = await fetchGongConnector(connectorId);

  const result = await syncSucceeded(connector.id);
  if (result.isErr()) {
    throw result.error;
  }
}

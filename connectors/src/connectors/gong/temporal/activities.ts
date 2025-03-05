import type { ModelId } from "@dust-tt/types";

import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import { ConnectorResource } from "@connectors/resources/connector_resource";

export async function gongSaveStartSyncActivity(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Gong] Connector not found.");
  }

  const res = await syncStarted(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

export async function gongSaveSyncSuccessActivity(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Gong] Connector not found.");
  }

  const res = await syncSucceeded(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

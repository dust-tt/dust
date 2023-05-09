import { Connector, ModelId } from "@connectors/lib/models";
import { Err, Ok, Result } from "@connectors/lib/result";
import { ConnectorSyncStatus } from "@connectors/types/connector";

async function syncFinished(
  connectorId: ModelId,
  status: ConnectorSyncStatus,
  finishedAt: Date
): Promise<Result<void, Error>> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error("Connector not found"));
  }
  connector.lastSyncStatus = status;
  connector.lastSyncFinishTime = finishedAt;
  if (status === "succeeded") {
    if (!connector.firstSuccessfulSyncTime) {
      connector.firstSuccessfulSyncTime = finishedAt;
    }
    connector.lastSyncSuccessfulTime = finishedAt;
  }

  await connector.save();

  return new Ok(undefined);
}

/**
 * Signal that a sync has succeeded.
 * This function can be used by the sync worker itself or by the supervisor.
 */
export async function syncSucceeded(connectorId: ModelId, at?: Date) {
  if (!at) {
    at = new Date();
  }

  return syncFinished(connectorId, "succeeded", at);
}

/**
 * Signal that a sync has failed.
 * This function can be used by the sync worker itself or by the supervisor.
 */
export async function syncFailed(connectorId: ModelId, at?: Date) {
  if (!at) {
    at = new Date();
  }
  return syncFinished(connectorId, "failed", new Date());
}

/**
 * Signal that a sync has started.
 * This function can be used by the sync worker itself or by the supervisor.
 */
export async function syncStarted(connectorId: ModelId, startedAt?: Date) {
  if (!startedAt) {
    startedAt = new Date();
  }
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error("Connector not found"));
  }
  connector.lastSyncStartTime = startedAt;
  await connector.save();

  return new Ok(undefined);
}

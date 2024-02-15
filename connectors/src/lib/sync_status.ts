import type {
  ConnectorErrorType,
  ConnectorSyncStatus,
  ModelId,
} from "@dust-tt/types";

import type { Result } from "@connectors/lib/result";
import { Err, Ok } from "@connectors/lib/result";
import { ConnectorResource } from "@connectors/resources/connector_resource";

async function syncFinished({
  connectorId,
  status,
  finishedAt,
  errorType,
}: {
  connectorId: ModelId;
  status: ConnectorSyncStatus;
  finishedAt: Date;
  errorType: ConnectorErrorType | null;
}): Promise<Result<void, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error("Connector not found"));
  }

  let { firstSuccessfulSyncTime, lastSyncSuccessfulTime } = connector;
  if (status === "succeeded") {
    if (!connector.firstSuccessfulSyncTime) {
      firstSuccessfulSyncTime = finishedAt;
    }
    lastSyncSuccessfulTime = finishedAt;
  }

  await connector.update({
    errorType: errorType,
    firstSuccessfulSyncTime,
    lastSyncFinishTime: finishedAt,
    lastSyncStatus: status,
    lastSyncSuccessfulTime,
  });

  return new Ok(undefined);
}

export async function reportInitialSyncProgress(
  connectorId: ModelId,
  progress: string
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error("Connector not found"));
  }

  await connector.update({
    firstSyncProgress: progress,
    lastSyncSuccessfulTime: null,
  });

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

  return syncFinished({
    connectorId: connectorId,
    status: "succeeded",
    finishedAt: at,
    errorType: null,
  });
}

/**
 * Signal that a sync has failed.
 * This function can be used by the sync worker itself or by the supervisor.
 */
export async function syncFailed(
  connectorId: ModelId,
  errorType: ConnectorErrorType,
  at?: Date
) {
  if (!at) {
    at = new Date();
  }
  return syncFinished({
    connectorId,
    status: "failed",
    finishedAt: new Date(),
    errorType,
  });
}

/**
 * Signal that a sync has started.
 * This function can be used by the sync worker itself or by the supervisor.
 */
export async function syncStarted(connectorId: ModelId, startedAt?: Date) {
  if (!startedAt) {
    startedAt = new Date();
  }
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error("Connector not found"));
  }
  await connector.update({
    lastSyncStartTime: startedAt,
  });

  return new Ok(undefined);
}

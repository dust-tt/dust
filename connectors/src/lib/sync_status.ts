import { Connector, ModelId } from "@connectors/lib/models";
import { Err, Ok, Result } from "@connectors/lib/result";
import {
  ConnectorErrorType,
  ConnectorSyncStatus,
} from "@connectors/types/connector";

async function syncFinished({
  connectorId,
  status,
  finishedAt,
  errorMessage,
  errorType,
}: {
  connectorId: ModelId;
  status: ConnectorSyncStatus;
  finishedAt: Date;
  errorMessage?: string;
  errorType?: ConnectorErrorType;
}): Promise<Result<void, Error>> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error("Connector not found"));
  }
  connector.lastSyncStatus = status;
  connector.lastSyncFinishTime = finishedAt;
  connector.errorMessage = errorMessage;
  connector.errorType = errorType;
  if (status === "succeeded") {
    if (!connector.firstSuccessfulSyncTime) {
      connector.firstSuccessfulSyncTime = finishedAt;
    }
    connector.lastSyncSuccessfulTime = finishedAt;
  }

  await connector.save();

  return new Ok(undefined);
}

export async function reportInitialSyncProgress(
  connectorId: ModelId,
  progress: string
) {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error("Connector not found"));
  }
  connector.firstSyncProgress = progress;
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

  return syncFinished({
    connectorId: connectorId,
    status: "succeeded",
    finishedAt: at,
    errorMessage: undefined,
    errorType: undefined,
  });
}

/**
 * Signal that a sync has failed.
 * This function can be used by the sync worker itself or by the supervisor.
 */
export async function syncFailed(
  connectorId: ModelId,
  errorMessage: string,
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
    errorMessage,
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
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error("Connector not found"));
  }
  connector.lastSyncStartTime = startedAt;
  await connector.save();

  return new Ok(undefined);
}

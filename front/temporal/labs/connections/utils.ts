import type { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import logger from "@app/logger/logger";
import { SyncStatus } from "@app/types";

interface ConfigurationStatusUpdate {
  status: SyncStatus;
  error?: string | null;
  lastSyncStartedAt?: Date;
  lastSyncCompletedAt?: Date;
}

export async function updateConfigurationStatus(
  configuration: LabsConnectionsConfigurationResource,
  update: ConfigurationStatusUpdate
): Promise<void> {
  try {
    await configuration.setSyncStatus(update.status);

    if (update.error !== undefined) {
      await configuration.setLastSyncError(update.error);
    }

    if (update.lastSyncStartedAt) {
      await configuration.setLastSyncStartedAt(update.lastSyncStartedAt);
    }

    if (update.lastSyncCompletedAt) {
      await configuration.setLastSyncCompletedAt(update.lastSyncCompletedAt);
    }
  } catch (error) {
    logger.error(
      { error, configurationId: configuration.id },
      "Failed to update configuration status"
    );
  }
}

export async function markSyncStarted(
  configuration: LabsConnectionsConfigurationResource
): Promise<void> {
  await updateConfigurationStatus(configuration, {
    status: SyncStatus.IN_PROGRESS,
    error: null,
    lastSyncStartedAt: new Date(),
  });
}

export async function markSyncCompleted(
  configuration: LabsConnectionsConfigurationResource
): Promise<void> {
  await updateConfigurationStatus(configuration, {
    status: SyncStatus.COMPLETED,
    error: null,
    lastSyncCompletedAt: new Date(),
  });
}

export async function markSyncFailed(
  configuration: LabsConnectionsConfigurationResource,
  error: string
): Promise<void> {
  await updateConfigurationStatus(configuration, {
    status: SyncStatus.FAILED,
    error,
  });
}

export function makeLabsConnectionWorkflowId(
  connectionConfiguration: LabsConnectionsConfigurationResource,
  isIncrementalSync: boolean = false
): string {
  return `labs-connection-${isIncrementalSync ? "incremental" : "full"}-sync-${connectionConfiguration.id}`;
}

import type { ContentNode, Result } from "@dust-tt/types";
import { Err, MIME_TYPES, Ok } from "@dust-tt/types";

import { makeGongTranscriptFolderInternalId } from "@connectors/connectors/gong/lib/internal_ids";
import { baseUrlFromConnectionId } from "@connectors/connectors/gong/lib/oauth";
import {
  fetchGongConfiguration,
  fetchGongConnector,
} from "@connectors/connectors/gong/lib/utils";
import {
  QUEUE_NAME,
  SCHEDULE_POLICIES,
  SCHEDULE_SPEC,
} from "@connectors/connectors/gong/temporal/config";
import { gongSyncWorkflow } from "@connectors/connectors/gong/temporal/workflows";
import type {
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import {
  BaseConnectorManager,
  ConnectorManagerError,
} from "@connectors/connectors/interface";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import {
  createSchedule,
  deleteSchedule,
  pauseSchedule,
  triggerSchedule,
} from "@connectors/lib/temporal_schedules";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const logger = mainLogger.child({ provider: "gong" });

const TRANSCRIPTS_FOLDER_TITLE = "Transcripts";

// This function generates a connector-wise unique schedule ID for the Gong sync.
// The IDs of the workflows spawned by this schedule will follow the pattern:
//   gong-sync-${connectorId}-workflow-${isoFormatDate}
function makeGongSyncScheduleId(connector: ConnectorResource): string {
  return `gong-sync-${connector.id}`;
}

export class GongConnectorManager extends BaseConnectorManager<null> {
  static async create({
    dataSourceConfig,
    connectionId,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
  }): Promise<Result<string, ConnectorManagerError<CreateConnectorErrorCode>>> {
    const baseUrlRes = await baseUrlFromConnectionId(connectionId);
    if (baseUrlRes.isErr()) {
      throw new Error("Invalid Gong Access Token");
    }

    const connector = await ConnectorResource.makeNew(
      "gong",
      {
        connectionId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
      {
        baseUrl: baseUrlRes.value,
      }
    );

    // Upsert a top-level folder that will contain all the transcripts (non-selectable).
    await upsertDataSourceFolder({
      dataSourceConfig: dataSourceConfigFromConnector(connector),
      folderId: makeGongTranscriptFolderInternalId(connector),
      parents: [makeGongTranscriptFolderInternalId(connector)],
      parentId: null,
      title: TRANSCRIPTS_FOLDER_TITLE,
      mimeType: MIME_TYPES.GONG.TRANSCRIPT_FOLDER,
    });

    const result = await createSchedule({
      connector,
      action: {
        type: "startWorkflow",
        workflowType: gongSyncWorkflow,
        args: [
          {
            connectorId: connector.id,
            fromTs: null,
            forceResync: false,
          },
        ],
        taskQueue: QUEUE_NAME,
      },
      scheduleId: makeGongSyncScheduleId(connector),
      policies: SCHEDULE_POLICIES,
      spec: SCHEDULE_SPEC,
    });
    if (result.isErr()) {
      throw result.error;
    }

    return new Ok(connector.id.toString());
  }

  async update({
    connectionId,
  }: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorManagerError<UpdateConnectorErrorCode>>> {
    const connector = await fetchGongConnector({
      connectorId: this.connectorId,
    });

    if (connectionId) {
      const config = await fetchGongConfiguration(connector);

      const { baseUrl } = config;
      const newBaseUrlRes = await baseUrlFromConnectionId(connectionId);

      if (newBaseUrlRes.isErr()) {
        throw new Error("Invalid Gong Access Token");
      }

      if (newBaseUrlRes.value !== baseUrl) {
        return new Err(
          new ConnectorManagerError(
            "CONNECTOR_OAUTH_TARGET_MISMATCH",
            "Cannot change workspace of a Gong connector"
          )
        );
      }

      await connector.update({
        connectionId,
      });

      // If connector was previously paused, unpause it.
      if (connector.isPaused()) {
        await this.unpause();

        await triggerSchedule({
          connector,
          scheduleId: makeGongSyncScheduleId(connector),
        });
      }
    }

    return new Ok(connector.id.toString());
  }

  async clean(): Promise<Result<undefined, Error>> {
    const connector = await fetchGongConnector({
      connectorId: this.connectorId,
    });

    const scheduleResult = await deleteSchedule({
      connector,
      scheduleId: makeGongSyncScheduleId(connector),
    });
    if (scheduleResult.isErr()) {
      return scheduleResult;
    }
    const connectorResult = await connector.delete();
    if (connectorResult.isErr()) {
      logger.error(
        {
          connectorId: connector.id,
          error: connectorResult.error,
        },
        "[Gong] Failed to delete connector."
      );
      return connectorResult;
    }

    return new Ok(undefined);
  }

  async stop(): Promise<Result<undefined, Error>> {
    const connector = await fetchGongConnector({
      connectorId: this.connectorId,
    });
    const result = await pauseSchedule({
      connector,
      scheduleId: makeGongSyncScheduleId(connector),
    });
    if (result.isErr()) {
      return result;
    }
    return new Ok(undefined);
  }

  async resume(): Promise<Result<undefined, Error>> {
    const connector = await fetchGongConnector({
      connectorId: this.connectorId,
    });
    const result = await triggerSchedule({
      connector,
      scheduleId: makeGongSyncScheduleId(connector),
    });
    if (result.isErr()) {
      throw result.error;
    }
    return new Ok(undefined);
  }

  async sync({
    fromTs,
  }: {
    fromTs: number | null;
  }): Promise<Result<string, Error>> {
    const connector = await fetchGongConnector({
      connectorId: this.connectorId,
    });
    const configuration = await fetchGongConfiguration(connector);

    if (!fromTs) {
      // Resetting the last sync timestamp to run a full sync.
      await configuration.resetLastSyncTimestamp();
    } else {
      // If fromTs is set, we ignore it and sync from the last cursor; we cannot miss transcripts if we assume that
      // transcripts cannot be created in the past.
      logger.warn(
        `[Gong] Ignoring the fromTs, syncing from ${configuration.lastSyncTimestamp}.`
      );
    }

    const result = await triggerSchedule({
      connector,
      scheduleId: makeGongSyncScheduleId(connector),
    });
    if (result.isErr()) {
      throw result.error;
    }
    return new Ok(connector.id.toString());
  }

  async retrievePermissions(): Promise<
    Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
  > {
    return new Ok([]);
  }

  async setPermissions(): Promise<Result<void, Error>> {
    throw new Error("Method not supported.");
  }

  async pause(): Promise<Result<undefined, Error>> {
    const connector = await fetchGongConnector({
      connectorId: this.connectorId,
    });
    await connector.markAsPaused();
    return this.stop();
  }

  async unpause(): Promise<Result<undefined, Error>> {
    const connector = await fetchGongConnector({
      connectorId: this.connectorId,
    });
    await connector.markAsUnpaused();
    return this.resume();
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    throw new Error("Method not supported.");
  }

  async configure(): Promise<Result<void, Error>> {
    throw new Error("Method not supported.");
  }

  async setConfigurationKey(): Promise<Result<void, Error>> {
    throw new Error("Method not supported.");
  }

  async getConfigurationKey(): Promise<Result<string | null, Error>> {
    throw new Error("Method not supported.");
  }
}

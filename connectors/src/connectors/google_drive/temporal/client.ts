import { WorkflowHandle, WorkflowNotFoundError } from "@temporalio/client";

import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { Connector, ModelId } from "@connectors/lib/models";
import { Err, Ok, Result } from "@connectors/lib/result";
import { getTemporalClient } from "@connectors/lib/temporal";
import mainLogger from "@connectors/logger/logger";

import { newWebhookSignal } from "./signals";
import {
  googleDriveFullSync,
  googleDriveFullSyncWorkflowId,
  googleDriveIncrementalSync,
  googleDriveIncrementalSyncWorkflowId,
  googleDriveRenewWebhooks,
  googleDriveRenewWebhooksWorkflowId,
} from "./workflows";
const logger = mainLogger.child({ provider: "google" });

export async function launchGoogleDriveFullSyncWorkflow(
  connectorId: string,
  fromTs: number | null
): Promise<Result<string, Error>> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  if (fromTs) {
    return new Err(
      new Error("Google Drive connector does not support partial resync")
    );
  }

  const client = await getTemporalClient();
  const connectorIdModelId = parseInt(connectorId, 10) as ModelId;

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const nangoConnectionId = connector.connectionId;

  const workflowId = googleDriveFullSyncWorkflowId(connectorId);
  try {
    const handle: WorkflowHandle<typeof googleDriveFullSync> =
      client.workflow.getHandle(workflowId);
    try {
      await handle.terminate();
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
      }
    }
    await client.workflow.start(googleDriveFullSync, {
      args: [connectorIdModelId, nangoConnectionId, dataSourceConfig],
      taskQueue: "google-queue",
      workflowId: workflowId,

      memo: {
        connectorId: connectorId,
      },
    });
    logger.info(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
      },
      `Started workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
        error: e,
      },
      `Failed starting workflow.`
    );
    return new Err(e as Error);
  }
}

export async function launchGoogleDriveIncrementalSyncWorkflow(
  connectorId: string
): Promise<Result<string, Error>> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }
  const client = await getTemporalClient();
  const connectorIdModelId = parseInt(connectorId, 10) as ModelId;

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const nangoConnectionId = connector.connectionId;

  const workflowId = googleDriveIncrementalSyncWorkflowId(connectorId);
  try {
    await client.workflow.signalWithStart(googleDriveIncrementalSync, {
      args: [connectorIdModelId, nangoConnectionId, dataSourceConfig],
      taskQueue: "google-queue",
      workflowId: workflowId,
      signal: newWebhookSignal,
      signalArgs: undefined,
      memo: {
        connectorId: connectorId,
      },
    });
    logger.info(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
      },
      `Started workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workspaceId: dataSourceConfig.workspaceId,
        workflowId,
        error: e,
      },
      `Failed starting workflow.`
    );
    return new Err(e as Error);
  }
}

export async function launchGoogleDriveRenewWebhooksWorkflow(): Promise<
  Result<string, Error>
> {
  const client = await getTemporalClient();

  const workflowId = googleDriveRenewWebhooksWorkflowId();
  try {
    const handle = client.workflow.getHandle(workflowId);
    await handle.terminate();
  } catch (e) {
    if (!(e instanceof WorkflowNotFoundError)) {
      throw e;
    }
  }
  try {
    await client.workflow.start(googleDriveRenewWebhooks, {
      args: [],
      taskQueue: "google-queue",
      workflowId: workflowId,
      cronSchedule: "0 * * * *", // every hour, on the hour
    });
    logger.info(
      {
        workflowId,
      },
      `Started workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      `Failed starting workflow.`
    );
    return new Err(e as Error);
  }
}

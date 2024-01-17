import type { ModelId } from "@dust-tt/types";
import { rateLimiter, RateLimitError } from "@dust-tt/types";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { Connector } from "@connectors/lib/models";
import type { Result } from "@connectors/lib/result";
import { Err, Ok } from "@connectors/lib/result";
import { getTemporalClient } from "@connectors/lib/temporal";
import mainLogger from "@connectors/logger/logger";

import { GDRIVE_INCREMENTAL_SYNC_DEBOUNCE_SEC, QUEUE_NAME } from "./config";
import { newWebhookSignal } from "./signals";
import {
  googleDriveFullSync,
  googleDriveFullSyncWorkflowId,
  googleDriveGarbageCollectorWorkflow,
  googleDriveGarbageCollectorWorkflowId,
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
      args: [connectorIdModelId, dataSourceConfig],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      searchAttributes: {
        connectorId: [parseInt(connectorId)],
      },
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
  if (
    (await rateLimiter({
      key: `launchGoogleDriveIncrementalSyncWorkflow-${connectorId}`,
      maxPerTimeframe: 1,
      timeframeSeconds: GDRIVE_INCREMENTAL_SYNC_DEBOUNCE_SEC,
      logger: logger,
    })) === 0
  ) {
    return new Err(new RateLimitError("Rate limit exceeded"));
  }
  const client = await getTemporalClient();
  const connectorIdModelId = parseInt(connectorId, 10) as ModelId;

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const workflowId = googleDriveIncrementalSyncWorkflowId(connectorId);
  try {
    await client.workflow.signalWithStart(googleDriveIncrementalSync, {
      args: [connectorIdModelId, dataSourceConfig],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      searchAttributes: {
        connectorId: [parseInt(connectorId)],
      },
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
      taskQueue: QUEUE_NAME,
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

export async function launchGoogleGarbageCollector(
  connectorId: ModelId
): Promise<Result<string, Error>> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector ${connectorId} not found`));
  }

  const client = await getTemporalClient();
  const workflowId = googleDriveGarbageCollectorWorkflowId(connectorId);
  try {
    const handle: WorkflowHandle<typeof googleDriveGarbageCollectorWorkflow> =
      client.workflow.getHandle(workflowId);
    try {
      await handle.terminate();
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
      }
    }
    await client.workflow.start(googleDriveGarbageCollectorWorkflow, {
      args: [connector.id, new Date().getTime()],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      memo: {
        connectorId: connectorId,
      },
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

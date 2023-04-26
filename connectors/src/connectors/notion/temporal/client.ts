import {
  WorkflowExecutionDescription,
  WorkflowHandle,
  WorkflowNotFoundError,
} from "@temporalio/client";

import {
  getLastSyncPeriodTsQuery,
  notionSyncWorkflow,
} from "@connectors/connectors/notion/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import {
  DataSourceConfig,
  DataSourceInfo,
} from "@connectors/types/data_source_config";

function getWorkflowId(dataSourceConfig: DataSourceInfo) {
  return `workflow-notion-${dataSourceConfig.workspaceId}-${dataSourceConfig.dataSourceName}`;
}

export async function launchNotionSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  nangoConnectionId: string,
  startFromTs: number | null = null,
  forceStartFromScratch = false
) {
  if (startFromTs && forceStartFromScratch) {
    throw new Error(
      "Cannot specify both startFromTs and forceStartFromScratch"
    );
  }

  const client = await getTemporalClient();

  const existingWorkflowStatus = await getNotionConnectionStatus(
    dataSourceConfig
  );

  if (
    existingWorkflowStatus &&
    existingWorkflowStatus.status &&
    existingWorkflowStatus.status.status.name === "RUNNING"
  ) {
    logger.warn(
      {
        workspaceId: dataSourceConfig.workspaceId,
      },
      "Notion sync workflow already running"
    );
    return;
  }

  let lastSyncedPeriodTs: number | null = null;

  if (existingWorkflowStatus.status) {
    if (!forceStartFromScratch) {
      lastSyncedPeriodTs = existingWorkflowStatus.lastSyncPeriodTs;
    }

    logger.info(
      { workspaceId: dataSourceConfig.workspaceId },
      "Cancelling existing Notion sync workflow"
    );

    const handle = client.workflow.getHandle(getWorkflowId(dataSourceConfig));
    await handle.cancel();
  }

  await client.workflow.start(notionSyncWorkflow, {
    args: [
      dataSourceConfig,
      nangoConnectionId,
      startFromTs || lastSyncedPeriodTs || undefined,
    ],
    taskQueue: "notion-queue",
    workflowId: getWorkflowId(dataSourceConfig),
  });

  logger.info(
    { workspaceId: dataSourceConfig.workspaceId },
    "Started Notion sync workflow"
  );
}

export async function stopNotionSyncWorkflow(
  dataSourceConfig: DataSourceInfo
): Promise<void> {
  const client = await getTemporalClient();

  const existingWorkflowStatus = await getNotionConnectionStatus(
    dataSourceConfig
  );

  if (
    existingWorkflowStatus &&
    existingWorkflowStatus.status &&
    existingWorkflowStatus.status.status.name !== "RUNNING"
  ) {
    logger.warn(
      {
        workspaceId: dataSourceConfig.workspaceId,
      },
      "Notion sync workflow is not running"
    );
    return;
  }

  if (!existingWorkflowStatus.status) {
    logger.warn(
      {
        workspaceId: dataSourceConfig.workspaceId,
      },
      "Notion sync workflow not found"
    );
    return;
  }

  logger.info(
    { workspaceId: dataSourceConfig.workspaceId },
    "Cancelling existing Notion sync workflow"
  );

  const handle = client.workflow.getHandle(getWorkflowId(dataSourceConfig));
  await handle.cancel();

  logger.info(
    { workspaceId: dataSourceConfig.workspaceId },
    "Cancelled Notion sync workflow"
  );
}

export async function getNotionConnectionStatus(
  dataSourceInfo: DataSourceInfo
): Promise<{
  status: WorkflowExecutionDescription | null;
  lastSyncPeriodTs: number | null;
}> {
  const client = await getTemporalClient();

  const handle: WorkflowHandle<typeof notionSyncWorkflow> =
    client.workflow.getHandle(getWorkflowId(dataSourceInfo));
  try {
    const [execStatusRes, lastSyncPeriodTsRes] = await Promise.all([
      handle.describe(),
      handle.query(getLastSyncPeriodTsQuery),
    ]);
    return {
      status: execStatusRes,
      lastSyncPeriodTs: lastSyncPeriodTsRes,
    };
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      logger.warn(
        `Notion sync workflow not found for workspace ${dataSourceInfo.workspaceId}`
      );
      return {
        status: null,
        lastSyncPeriodTs: null,
      };
    }

    throw e;
  }
}

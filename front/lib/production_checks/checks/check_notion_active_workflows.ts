import { isUpgraded } from "@app/lib/plans/plan_codes";
import { getConnectorsPrimaryDbConnection } from "@app/lib/production_checks/utils";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getTemporalClientForConnectorsNamespace } from "@app/lib/temporal";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { getNotionWorkflowId } from "@app/types/connectors/workflows";
import type { ActionLink, CheckFunction } from "@app/types/production_checks";
import type { ModelId } from "@app/types/shared/model_id";
import type { Client, WorkflowExecutionDescription } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";
import type { Logger } from "pino";
import { QueryTypes } from "sequelize";

const TEMPORAL_WORKFLOW_STALLED_THRESHOLD_MS = 12 * 60 * 60 * 1000; // 12 hours.

interface NotionConnector {
  id: number;
  dataSourceId: string;
  workspaceId: string;
  pausedAt: Date | null;
}

async function listAllNotionConnectors() {
  const connectorsDb = getConnectorsPrimaryDbConnection();

  // biome-ignore lint/plugin/noRawSql: production check uses read replica
  return connectorsDb.query<NotionConnector>(
    `SELECT id, "dataSourceId", "workspaceId", "pausedAt" FROM connectors WHERE "type" = 'notion' and  "errorType" IS NULL`,
    {
      type: QueryTypes.SELECT,
    }
  );
}

async function getWorkflowDescriptions({
  client,
  logger,
  notionConnector,
}: {
  client: Client;
  logger: Logger;
  notionConnector: NotionConnector;
}): Promise<WorkflowExecutionDescription[] | null> {
  try {
    const incrementalSyncHandle = client.workflow.getHandle(
      getNotionWorkflowId(notionConnector.id, "sync")
    );
    const garbageCollectorHandle = client.workflow.getHandle(
      getNotionWorkflowId(notionConnector.id, "garbage-collector")
    );
    const processDatabaseUpsertQueueHandle = client.workflow.getHandle(
      getNotionWorkflowId(notionConnector.id, "process-database-upsert-queue")
    );

    return await Promise.all([
      incrementalSyncHandle.describe(),
      garbageCollectorHandle.describe(),
      processDatabaseUpsertQueueHandle.describe(),
    ]);
  } catch (error) {
    if (!(error instanceof WorkflowNotFoundError)) {
      logger.error(
        {
          error,
        },
        "Failed to retrieve Notion Temporal workflow descriptions."
      );
    }

    return null;
  }
}

async function getLatestWorkflowEventDate({
  client,
  description,
  logger,
}: {
  client: Client;
  description: WorkflowExecutionDescription;
  logger: Logger;
}): Promise<Date | null> {
  let response: Awaited<
    ReturnType<Client["workflowService"]["getWorkflowExecutionHistoryReverse"]>
  >;
  try {
    response = await client.workflowService.getWorkflowExecutionHistoryReverse({
      namespace: client.options.namespace,
      execution: {
        workflowId: description.workflowId,
        runId: description.runId,
      },
      maximumPageSize: 1,
    });
  } catch (error) {
    logger.error(
      {
        error,
        runId: description.runId,
        workflowId: description.workflowId,
      },
      "Failed to retrieve latest Notion Temporal history event."
    );

    return null;
  }

  const latestEvent = response.history?.events?.[0];
  const latestEventSeconds = latestEvent?.eventTime?.seconds;

  return latestEventSeconds
    ? new Date(Number(latestEventSeconds) * 1000)
    : null;
}

async function areTemporalWorkflowsRunning(
  client: Client,
  notionConnector: NotionConnector,
  logger: Logger
): Promise<{
  isRunning: boolean;
  isNotStalled: boolean;
}> {
  const descriptions = await getWorkflowDescriptions({
    client,
    notionConnector,
    logger,
  });

  if (!descriptions) {
    return {
      isRunning: false,
      isNotStalled: false,
    };
  }

  const isRunning = descriptions.every(
    ({ status: { name } }) => name === "RUNNING"
  );

  if (!isRunning) {
    return {
      isRunning,
      isNotStalled: false,
    };
  }

  // Bounded (only three elements), Temporal-only Promise.all.
  const latestEventTimes = await Promise.all(
    descriptions.map((description) =>
      getLatestWorkflowEventDate({ client, description, logger })
    )
  );

  const now = new Date().getTime();

  return {
    isRunning,
    isNotStalled: latestEventTimes.every(
      (d) => d && now - d.getTime() < TEMPORAL_WORKFLOW_STALLED_THRESHOLD_MS
    ),
  };
}

export const checkNotionActiveWorkflows: CheckFunction = async (
  _checkName,
  logger,
  reportSuccess,
  reportFailure,
  heartbeat
) => {
  const notionConnectors = await listAllNotionConnectors();

  const workspaceIds = [...new Set(notionConnectors.map((c) => c.workspaceId))];
  const workspaceResources = await WorkspaceResource.fetchByIds(workspaceIds);
  const workspaces = workspaceResources.map((w) =>
    renderLightWorkspaceType({ workspace: w })
  );
  const subscriptionsByWorkspaceId =
    await SubscriptionResource.fetchActiveByWorkspaces(workspaces);

  const client = await getTemporalClientForConnectorsNamespace();

  logger.info(`Found ${notionConnectors.length} Notion connectors.`);

  const missingActiveWorkflows: {
    connectorId: ModelId;
    workspaceId: string;
  }[] = [];
  const stalledWorkflows: {
    connectorId: ModelId;
    workspaceId: string;
  }[] = [];

  for (const notionConnector of notionConnectors) {
    const localLogger = logger.child({ connectorId: notionConnector.id });

    if (notionConnector.pausedAt) {
      continue;
    }

    const subscription =
      subscriptionsByWorkspaceId[notionConnector.workspaceId];
    if (!subscription || !isUpgraded(subscription.getPlan())) {
      continue;
    }

    heartbeat();

    const { isRunning, isNotStalled } = await areTemporalWorkflowsRunning(
      client,
      notionConnector,
      localLogger
    );

    if (!isRunning) {
      missingActiveWorkflows.push({
        connectorId: notionConnector.id,
        workspaceId: notionConnector.workspaceId,
      });
    } else if (!isNotStalled) {
      stalledWorkflows.push({
        connectorId: notionConnector.id,
        workspaceId: notionConnector.workspaceId,
      });
    }
  }

  if (missingActiveWorkflows.length > 0 || stalledWorkflows.length > 0) {
    const actionLinks: ActionLink[] = [
      ...missingActiveWorkflows.map(({ connectorId }) => ({
        label: `Missing: connector ${connectorId}`,
        url: `/poke/connectors/${connectorId}`,
      })),
      ...stalledWorkflows.map(({ connectorId }) => ({
        label: `Stalled: connector ${connectorId}`,
        url: `/poke/connectors/${connectorId}`,
      })),
    ];
    reportFailure(
      {
        missingActiveWorkflows,
        stalledWorkflows,
        actionLinks,
      },
      "Missing or stalled Notion temporal workflows"
    );
  } else {
    reportSuccess();
  }
};

import { isUpgraded } from "@app/lib/plans/plan_codes";
import { getConnectorsPrimaryDbConnection } from "@app/lib/production_checks/utils";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getTemporalClientForConnectorsNamespace } from "@app/lib/temporal";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { getNotionWorkflowId } from "@app/types/connectors/workflows";
import type { ActionLink, CheckFunction } from "@app/types/production_checks";
import { withRetries } from "@app/types/shared/retries";
import type { Client, WorkflowExecutionDescription } from "@temporalio/client";
import type pino from "pino";
import { QueryTypes } from "sequelize";

const TEMPORAL_WORKFLOW_CHECK_RETRIES = 10;
const TEMPORAL_WORKFLOW_STALLED_THRESHOLD_MS = 12 * 60 * 60 * 1000;

interface NotionConnector {
  id: number;
  dataSourceId: string;
  workspaceId: string;
  pausedAt: Date | null;
}

async function listAllNotionConnectors() {
  const connectorsDb = getConnectorsPrimaryDbConnection();

  // biome-ignore lint/plugin/noRawSql: production check uses read replica
  const notionConnectors: NotionConnector[] = await connectorsDb.query(
    `SELECT id, "dataSourceId", "workspaceId", "pausedAt" FROM connectors WHERE "type" = 'notion' and  "errorType" IS NULL`,
    {
      type: QueryTypes.SELECT,
    }
  );

  return notionConnectors;
}

type NotionWorkflowDescriptions = [
  WorkflowExecutionDescription,
  WorkflowExecutionDescription,
  WorkflowExecutionDescription,
];

async function getWorkflowDescriptions({
  client,
  notionConnector,
  logger,
}: {
  client: Client;
  notionConnector: NotionConnector;
  logger: pino.Logger;
}): Promise<NotionWorkflowDescriptions> {
  logger.info(
    {
      connectorId: notionConnector.id,
    },
    "Retrieving Notion handles"
  );
  const incrementalSyncHandle = client.workflow.getHandle(
    getNotionWorkflowId(notionConnector.id, "sync")
  );
  const garbageCollectorHandle = client.workflow.getHandle(
    getNotionWorkflowId(notionConnector.id, "garbage-collector")
  );
  const processDatabaseUpsertQueueHandle = client.workflow.getHandle(
    getNotionWorkflowId(notionConnector.id, "process-database-upsert-queue")
  );

  logger.info(
    {
      connectorId: notionConnector.id,
    },
    "Retrieved Notion handles"
  );

  const descriptions = await Promise.all([
    incrementalSyncHandle.describe(),
    garbageCollectorHandle.describe(),
    processDatabaseUpsertQueueHandle.describe(),
  ]);
  logger.info(
    {
      connectorId: notionConnector.id,
    },
    "Retrieved descriptions"
  );

  return descriptions;
}

async function getLatestWorkflowEventTime({
  client,
  description,
}: {
  client: Client;
  description: WorkflowExecutionDescription;
}): Promise<Date | null> {
  const response =
    await client.workflowService.getWorkflowExecutionHistoryReverse({
      namespace: client.options.namespace,
      execution: {
        workflowId: description.workflowId,
        runId: description.runId,
      },
      maximumPageSize: 1,
    });

  const latestEvent = response.history?.events?.[0];
  const latestEventSeconds = latestEvent?.eventTime?.seconds;

  return latestEventSeconds
    ? new Date(Number(latestEventSeconds) * 1000)
    : null;
}

async function areTemporalWorkflowsRunning(
  client: Client,
  notionConnector: NotionConnector,
  logger: pino.Logger
) {
  try {
    const descriptions = await withRetries(logger, getWorkflowDescriptions, {
      retries: TEMPORAL_WORKFLOW_CHECK_RETRIES,
    })({
      client,
      notionConnector,
      logger,
    });

    logger.info(
      {
        connectorId: notionConnector.id,
      },
      "Workflow descriptions retrieved"
    );

    const isRunning = descriptions.every(
      ({ status: { name } }) => name === "RUNNING"
    );

    const details = isRunning
      ? ""
      : "Statuses of workflows are " +
        descriptions
          .map(({ status: { name }, workflowId }) => `${workflowId}: ${name}`)
          .join(", ");

    if (!isRunning) {
      return {
        isRunning,
        isNotStalled: false,
        details,
      };
    }

    const latestEventTimes = await withRetries(
      logger,
      async ({
        client,
        descriptions,
      }: {
        client: Client;
        descriptions: NotionWorkflowDescriptions;
      }): Promise<(Date | null)[]> => {
        return Promise.all(
          descriptions.map((description) =>
            getLatestWorkflowEventTime({ client, description })
          )
        );
      },
      {
        retries: TEMPORAL_WORKFLOW_CHECK_RETRIES,
      }
    )({
      client,
      descriptions,
    });

    const now = new Date().getTime();

    return {
      isRunning,
      isNotStalled: latestEventTimes.every(
        (d) => d && now - d.getTime() < TEMPORAL_WORKFLOW_STALLED_THRESHOLD_MS
      ),
      details,
    };
  } catch (err) {
    return {
      isRunning: false,
      isNotStalled: false,
      details: `Got Error: ${err}`,
    };
  }
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

  type MissingWorkflow = {
    connectorId: number;
    workspaceId: string;
    details: string;
  };

  type StalledWorkflow = {
    connectorId: number;
    workspaceId: string;
  };

  const missingActiveWorkflows: MissingWorkflow[] = [];
  const stalledWorkflows: StalledWorkflow[] = [];

  for (const notionConnector of notionConnectors) {
    if (notionConnector.pausedAt) {
      continue;
    }

    const subscription =
      subscriptionsByWorkspaceId[notionConnector.workspaceId];
    if (!subscription || !isUpgraded(subscription.getPlan())) {
      continue;
    }

    heartbeat();

    const { isRunning, isNotStalled, details } =
      await areTemporalWorkflowsRunning(client, notionConnector, logger);

    if (!isRunning) {
      missingActiveWorkflows.push({
        connectorId: notionConnector.id,
        workspaceId: notionConnector.workspaceId,
        details,
      });
    } else {
      if (!isNotStalled) {
        stalledWorkflows.push({
          connectorId: notionConnector.id,
          workspaceId: notionConnector.workspaceId,
        });
      }
    }
  }

  if (missingActiveWorkflows.length > 0) {
    const actionLinks: ActionLink[] = [
      ...missingActiveWorkflows.map((c) => ({
        label: `Missing: connector ${c.connectorId}`,
        url: `/poke/connectors/${c.connectorId}`,
      })),
      ...stalledWorkflows.map((c) => ({
        label: `Stalled: connector ${c.connectorId}`,
        url: `/poke/connectors/${c.connectorId}`,
      })),
    ];
    reportFailure(
      { missingActiveWorkflows, stalledWorkflows, actionLinks },
      "Missing or stalled Notion temporal workflows"
    );
  } else {
    reportSuccess();
  }
};

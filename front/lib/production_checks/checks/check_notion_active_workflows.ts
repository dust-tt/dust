import config from "@app/lib/api/config";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { getConnectorsPrimaryDbConnection } from "@app/lib/production_checks/utils";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getTemporalClientForConnectorsNamespace } from "@app/lib/temporal";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { getNotionWorkflowId } from "@app/types/connectors/workflows";
import type { ActionLink, CheckFunction } from "@app/types/production_checks";
import type { ModelId } from "@app/types/shared/model_id";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import type { Client, WorkflowExecutionDescription } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";
import { QueryTypes } from "sequelize";

const TEMPORAL_WORKFLOW_STALLED_THRESHOLD_MS = 12 * 60 * 60 * 1000; // 12 hours.

const NOTION_WORKFLOW_TYPES = [
  "sync",
  "garbage-collector",
  "process-database-upsert-queue",
] as const;

type NotionWorkflowType = (typeof NOTION_WORKFLOW_TYPES)[number];

interface NotionConnector {
  id: number;
  dataSourceId: string;
  workspaceId: string;
  pausedAt: Date | null;
}

interface MissingWorkflow {
  workflowType: NotionWorkflowType;
  workflowId: string;
  // "not_found" when the workflow does not exist, otherwise the Temporal
  // status name (TERMINATED, FAILED, ...).
  reason: string;
}

interface StalledWorkflow {
  workflowType: NotionWorkflowType;
  workflowId: string;
  latestEventAt: string | null;
}

interface MissingWorkflowsEntry {
  connectorId: ModelId;
  workspaceId: string;
  dataSourceId: string;
  missingWorkflows: MissingWorkflow[];
}

interface StalledWorkflowsEntry {
  connectorId: ModelId;
  workspaceId: string;
  dataSourceId: string;
  stalledWorkflows: StalledWorkflow[];
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

async function getConnectorWorkflowStates(
  client: Client,
  notionConnector: NotionConnector,
  logger: Logger
): Promise<{
  missingWorkflows: MissingWorkflow[];
  runningWorkflows: {
    workflowType: NotionWorkflowType;
    description: WorkflowExecutionDescription;
  }[];
}> {
  // Bounded (only three elements), Temporal-only Promise.all.
  const states = await Promise.all(
    NOTION_WORKFLOW_TYPES.map(async (workflowType) => {
      const workflowId = getNotionWorkflowId(notionConnector.id, workflowType);

      try {
        const description = await client.workflow
          .getHandle(workflowId)
          .describe();

        return { workflowType, workflowId, description };
      } catch (error) {
        if (error instanceof WorkflowNotFoundError) {
          return { workflowType, workflowId, description: null };
        }

        // Any other error (transient RPC failure, timeout, ...) is a Temporal
        // API problem: treating it as missing would report a false positive,
        // so rethrow and let the check fail loudly instead.
        logger.error(
          { workflowId, err: normalizeError(error) },
          "Failed to describe Notion Temporal workflow."
        );
        throw error;
      }
    })
  );

  const missingWorkflows: MissingWorkflow[] = [];
  const runningWorkflows: {
    workflowType: NotionWorkflowType;
    description: WorkflowExecutionDescription;
  }[] = [];

  for (const { workflowType, workflowId, description } of states) {
    if (!description) {
      missingWorkflows.push({ workflowType, workflowId, reason: "not_found" });
    } else if (description.status.name !== "RUNNING") {
      missingWorkflows.push({
        workflowType,
        workflowId,
        reason: description.status.name,
      });
    } else {
      runningWorkflows.push({ workflowType, description });
    }
  }

  return { missingWorkflows, runningWorkflows };
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
    // A history-fetch failure is a Temporal API problem, not a stalled
    // workflow: rethrow and let the check fail loudly instead of reporting a
    // false positive.
    logger.error(
      {
        err: normalizeError(error),
        runId: description.runId,
        workflowId: description.workflowId,
      },
      "Failed to retrieve latest Notion Temporal history event."
    );
    throw error;
  }

  const latestEvent = response.history?.events?.[0];
  const latestEventSeconds = latestEvent?.eventTime?.seconds;

  return latestEventSeconds
    ? new Date(Number(latestEventSeconds) * 1000)
    : null;
}

function makePokeDataSourceUrl(entry: {
  workspaceId: string;
  dataSourceId: string;
}): string {
  return `${config.getPokeAppUrl()}/${entry.workspaceId}/data_sources/${entry.dataSourceId}`;
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

  const missingActiveWorkflows: MissingWorkflowsEntry[] = [];
  const stalledActiveWorkflows: StalledWorkflowsEntry[] = [];

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

    const { missingWorkflows, runningWorkflows } =
      await getConnectorWorkflowStates(client, notionConnector, localLogger);

    if (missingWorkflows.length > 0) {
      missingActiveWorkflows.push({
        connectorId: notionConnector.id,
        workspaceId: notionConnector.workspaceId,
        dataSourceId: notionConnector.dataSourceId,
        missingWorkflows,
      });
      continue;
    }

    const nowMs = Date.now();

    // Bounded (only three elements), Temporal-only Promise.all.
    const stalledWorkflows = removeNulls(
      await Promise.all(
        runningWorkflows.map(
          async ({
            workflowType,
            description,
          }): Promise<StalledWorkflow | null> => {
            const latestEventDate = await getLatestWorkflowEventDate({
              client,
              description,
              logger: localLogger,
            });

            const isStalled =
              !latestEventDate ||
              nowMs - latestEventDate.getTime() >=
                TEMPORAL_WORKFLOW_STALLED_THRESHOLD_MS;

            return isStalled
              ? {
                  workflowType,
                  workflowId: description.workflowId,
                  latestEventAt: latestEventDate?.toISOString() ?? null,
                }
              : null;
          }
        )
      )
    );

    if (stalledWorkflows.length > 0) {
      stalledActiveWorkflows.push({
        connectorId: notionConnector.id,
        workspaceId: notionConnector.workspaceId,
        dataSourceId: notionConnector.dataSourceId,
        stalledWorkflows,
      });
    }
  }

  if (missingActiveWorkflows.length > 0 || stalledActiveWorkflows.length > 0) {
    const actionLinks: ActionLink[] = [
      ...missingActiveWorkflows.map((c) => ({
        label: `Missing ${c.missingWorkflows
          .map((w) =>
            w.reason === "not_found"
              ? w.workflowType
              : `${w.workflowType} (${w.reason})`
          )
          .join(", ")}: ${c.dataSourceId}`,
        url: makePokeDataSourceUrl(c),
      })),
      ...stalledActiveWorkflows.map((c) => ({
        label: `Stalled ${c.stalledWorkflows
          .map((w) => w.workflowType)
          .join(", ")}: ${c.dataSourceId}`,
        url: makePokeDataSourceUrl(c),
      })),
    ];
    reportFailure(
      {
        missingActiveWorkflows,
        stalledWorkflows: stalledActiveWorkflows,
        actionLinks,
      },
      "Missing or stalled Notion temporal workflows"
    );
  } else {
    reportSuccess();
  }
};

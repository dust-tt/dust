import { getTemporalClientForConnectorsNamespace } from "@app/lib/temporal";
import type {
  CheckStuckResponseBody,
  PendingActivityInfo,
  StuckWorkflowInfo,
} from "@app/types/api/data_sources/check_stuck";
import {
  getNotionWorkflowId,
  getZendeskGarbageCollectionWorkflowId,
  getZendeskSyncWorkflowId,
  googleDriveIncrementalSyncWorkflowId,
  makeConfluenceSyncWorkflowId,
  makeGongSyncScheduleId,
  makeIntercomConversationScheduleId,
  makeIntercomHelpCenterScheduleId,
  microsoftGarbageCollectionWorkflowId,
  microsoftIncrementalSyncWorkflowId,
} from "@app/types/connectors/workflows";
import type { ConnectorProvider } from "@app/types/data_source";
import type { ModelId } from "@app/types/shared/model_id";
import type { Client, WorkflowExecutionDescription } from "@temporalio/client";
import { ScheduleNotFoundError } from "@temporalio/client";

const STUCK_THRESHOLD = 5;

async function getWorkflowIdsFromSchedule(
  client: Client,
  scheduleId: string
): Promise<string[]> {
  try {
    const scheduleHandle = client.schedule.getHandle(scheduleId);
    const scheduleDescription = await scheduleHandle.describe();
    return scheduleDescription.info.recentActions.map(
      (action) => action.action.workflow.workflowId
    );
  } catch (error) {
    if (error instanceof ScheduleNotFoundError) {
      return [];
    }
    throw error;
  }
}

async function getWorkflowIdsForConnector(
  connectorId: ModelId,
  connectorType: ConnectorProvider
): Promise<string[] | null> {
  switch (connectorType) {
    case "notion":
      return [
        getNotionWorkflowId(connectorId, "sync"),
        getNotionWorkflowId(connectorId, "garbage-collector"),
        getNotionWorkflowId(connectorId, "process-database-upsert-queue"),
      ];
    case "zendesk":
      return [
        getZendeskSyncWorkflowId(connectorId),
        getZendeskGarbageCollectionWorkflowId(connectorId),
      ];
    case "google_drive":
      return [googleDriveIncrementalSyncWorkflowId(connectorId)];
    case "confluence":
      return [makeConfluenceSyncWorkflowId(connectorId)];
    case "microsoft":
      return [
        microsoftIncrementalSyncWorkflowId(connectorId),
        microsoftGarbageCollectionWorkflowId(connectorId),
      ];
    case "gong": {
      const client = await getTemporalClientForConnectorsNamespace();
      return getWorkflowIdsFromSchedule(
        client,
        makeGongSyncScheduleId(connectorId)
      );
    }
    case "intercom": {
      const client = await getTemporalClientForConnectorsNamespace();
      const helpCenterWorkflows = await getWorkflowIdsFromSchedule(
        client,
        makeIntercomHelpCenterScheduleId(connectorId)
      );
      const conversationWorkflows = await getWorkflowIdsFromSchedule(
        client,
        makeIntercomConversationScheduleId(connectorId)
      );
      return [...helpCenterWorkflows, ...conversationWorkflows];
    }
    default:
      return null;
  }
}

function flattenStuckWorkflows(info: StuckWorkflowInfo): StuckWorkflowInfo[] {
  const result: StuckWorkflowInfo[] = [];

  if (info.stuckActivities.length > 0) {
    result.push(info);
  }

  for (const child of info.childWorkflows) {
    result.push(...flattenStuckWorkflows(child));
  }

  return result;
}

async function checkWorkflowStuck(
  client: Client,
  { workflowId }: { workflowId: string }
): Promise<StuckWorkflowInfo | null> {
  // `visited` is shared across the whole recursion via the closure below, so
  // sibling children dedupe against each other. It must not be passed as a
  // parameter (GEN5).
  const visited = new Set<string>();

  async function visit(id: string): Promise<StuckWorkflowInfo | null> {
    // Prevent infinite loops if there are circular child workflows.
    if (visited.has(id)) {
      return null;
    }
    visited.add(id);

    let description: WorkflowExecutionDescription;
    try {
      const handle = client.workflow.getHandle(id);
      description = await handle.describe();
    } catch {
      return null;
    }

    const pendingActivities: PendingActivityInfo[] = [];
    const stuckActivities: PendingActivityInfo[] = [];

    if (description.raw.pendingActivities) {
      for (const activity of description.raw.pendingActivities) {
        const activityInfo: PendingActivityInfo = {
          activityId: activity.activityId ?? "unknown",
          activityType: activity.activityType?.name ?? "unknown",
          attempt: activity.attempt ?? 0,
          lastFailure: activity.lastFailure?.message ?? null,
          state: activity.state?.toString() ?? "unknown",
        };

        pendingActivities.push(activityInfo);

        if (activityInfo.attempt >= STUCK_THRESHOLD) {
          stuckActivities.push(activityInfo);
        }
      }
    }

    const childWorkflows: StuckWorkflowInfo[] = [];
    if (description.raw.pendingChildren) {
      for (const child of description.raw.pendingChildren) {
        if (child.workflowId) {
          const childInfo = await visit(child.workflowId);
          if (childInfo) {
            childWorkflows.push(childInfo);
          }
        }
      }
    }

    return {
      workflowId: id,
      status: description.status.name,
      pendingActivities,
      stuckActivities,
      childWorkflows,
    };
  }

  return visit(workflowId);
}

/**
 * Inspect Temporal workflows for a data source's connector and report any
 * stuck activities (`STUCK_THRESHOLD`+ retries). Returns a flat summary
 * suitable for direct HTTP response, plus a noop message when the connector
 * type doesn't expose checkable workflows.
 */
export async function checkConnectorStuckForDataSource(dataSource: {
  connectorId: string | null;
  connectorProvider: ConnectorProvider | null;
}): Promise<CheckStuckResponseBody> {
  if (!dataSource.connectorId || !dataSource.connectorProvider) {
    return {
      isStuck: false,
      workflows: [],
      message: "This data source does not have a connector.",
    };
  }

  const client = await getTemporalClientForConnectorsNamespace();
  const workflowIds = await getWorkflowIdsForConnector(
    parseInt(dataSource.connectorId, 10),
    dataSource.connectorProvider
  );

  if (workflowIds === null) {
    return {
      isStuck: false,
      workflows: [],
      message: `Workflow checking not implemented for connector type: ${dataSource.connectorProvider}`,
    };
  }

  const workflows: StuckWorkflowInfo[] = [];

  for (const workflowId of workflowIds) {
    const workflowInfo = await checkWorkflowStuck(client, { workflowId });
    if (workflowInfo) {
      const flattenedWorkflows = flattenStuckWorkflows(workflowInfo);
      workflows.push(...flattenedWorkflows);
    }
  }

  const hasStuckActivities = workflows.length > 0;
  const totalStuckActivities = workflows.reduce(
    (sum, wf) => sum + wf.stuckActivities.length,
    0
  );
  const message = hasStuckActivities
    ? `Found ${totalStuckActivities} stuck activities (${STUCK_THRESHOLD}+ retries)`
    : "No stuck activities found";

  return { isStuck: hasStuckActivities, workflows, message };
}

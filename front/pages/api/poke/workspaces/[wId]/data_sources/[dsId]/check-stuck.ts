import type { Client, WorkflowExecutionDescription } from "@temporalio/client";
import { ScheduleNotFoundError } from "@temporalio/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { getTemporalClientForConnectorsNamespace } from "@app/lib/temporal";
import { apiError } from "@app/logger/withlogging";
import type {
  ConnectorProvider,
  ModelId,
  WithAPIErrorResponse,
} from "@app/types";
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
} from "@app/types";

export type PendingActivityInfo = {
  activityId: string;
  activityType: string;
  attempt: number;
  lastFailure: string | null;
  state: string;
};

export type StuckWorkflowInfo = {
  workflowId: string;
  status: string;
  pendingActivities: PendingActivityInfo[];
  stuckActivities: PendingActivityInfo[];
  childWorkflows: StuckWorkflowInfo[];
};

export type CheckStuckResponseBody = {
  isStuck: boolean;
  workflows: StuckWorkflowInfo[];
  message: string;
};

const STUCK_THRESHOLD = 5; // Consider an activity stuck if it has 5+ attempts

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
  {
    workflowId,
    visitedWorkflowIds = new Set(),
  }: {
    workflowId: string;
    visitedWorkflowIds?: Set<string>;
  }
): Promise<StuckWorkflowInfo | null> {
  // Prevent infinite loops if there are circular child workflows (shouldn't happen but still).
  if (visitedWorkflowIds.has(workflowId)) {
    return null;
  }
  visitedWorkflowIds.add(workflowId);

  let description: WorkflowExecutionDescription;
  try {
    const handle = client.workflow.getHandle(workflowId);
    description = await handle.describe();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
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

  // Check child workflows recursively.
  const childWorkflows: StuckWorkflowInfo[] = [];
  if (description.raw.pendingChildren) {
    for (const child of description.raw.pendingChildren) {
      if (child.workflowId) {
        const childInfo = await checkWorkflowStuck(client, {
          workflowId: child.workflowId,
          visitedWorkflowIds,
        });
        if (childInfo) {
          childWorkflows.push(childInfo);
        }
      }
    }
  }

  return {
    workflowId,
    status: description.status.name,
    pendingActivities,
    stuckActivities,
    childWorkflows,
  };
}

async function checkConnectorStuck(
  client: Client,
  workflowIds: string[]
): Promise<CheckStuckResponseBody> {
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

  return {
    isStuck: hasStuckActivities,
    workflows,
    message,
  };
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<CheckStuckResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const { dsId } = req.query;
  if (typeof dsId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      if (!dataSource.connectorId || !dataSource.connectorProvider) {
        return res.status(200).json({
          isStuck: false,
          workflows: [],
          message: "This data source does not have a connector.",
        });
      }

      const client = await getTemporalClientForConnectorsNamespace();
      const workflowIds = await getWorkflowIdsForConnector(
        parseInt(dataSource.connectorId, 10),
        dataSource.connectorProvider
      );

      if (workflowIds === null) {
        return res.status(200).json({
          isStuck: false,
          workflows: [],
          message: `Workflow checking not implemented for connector type: ${dataSource.connectorProvider}`,
        });
      }

      const result = await checkConnectorStuck(client, workflowIds);
      return res.status(200).json(result);

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);

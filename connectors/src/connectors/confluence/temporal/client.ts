import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { ScheduleOptionsAction, WorkflowHandle } from "@temporalio/client";
import {
  ScheduleOverlapPolicy,
  WorkflowNotFoundError,
} from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/confluence/temporal/config";
import type { SpaceUpdatesSignal } from "@connectors/connectors/confluence/temporal/signals";
import { spaceUpdatesSignal } from "@connectors/connectors/confluence/temporal/signals";
import {
  makeConfluencePersonalDataWorkflowId,
  makeConfluenceRemoveSpacesWorkflowId,
  makeConfluenceSyncWorkflowId,
} from "@connectors/connectors/confluence/temporal/utils";
import {
  confluencePersonalDataReportingWorkflow,
  confluenceRemoveSpacesWorkflow,
  confluenceSyncWorkflow,
} from "@connectors/connectors/confluence/temporal/workflows";
import { Connector } from "@connectors/lib/models";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { isScheduleAlreadyRunning } from "@connectors/types/errors";

export async function launchConfluenceSyncWorkflow(
  connectorId: ModelId,
  fromTs: number | null,
  spaceIds: string[] = [],
  forceUpsert = false
): Promise<Result<string, Error>> {
  if (fromTs) {
    throw new Error("[Confluence] Workflow does not support fromTs.");
  }

  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(
      `[Confluence] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const client = await getTemporalClient();

  const signalArgs: SpaceUpdatesSignal[] = spaceIds.map((sId) => ({
    action: "added",
    spaceId: sId,
  }));

  const workflowId = makeConfluenceSyncWorkflowId(connector.id);

  // When the workflow is inactive, we omit passing spaceIds as they are only used to signal modifications within a currently active full sync workflow.
  try {
    await client.workflow.signalWithStart(confluenceSyncWorkflow, {
      args: [
        {
          connectorId: connector.id,
          forceUpsert,
        },
      ],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      signal: spaceUpdatesSignal,
      signalArgs: [signalArgs],
      memo: {
        connectorId,
      },
      cronSchedule: "0 * * * *", // Every hour.
    });
  } catch (err) {
    return new Err(err as Error);
  }

  return new Ok(workflowId);
}

export async function launchConfluenceRemoveSpacesSyncWorkflow(
  connectorId: ModelId,
  spaceIds: string[] = []
): Promise<Result<string, Error>> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(
      `[Confluence] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const client = await getTemporalClient();
  const signalArgs: SpaceUpdatesSignal[] = spaceIds.map((sId) => ({
    action: "removed",
    spaceId: sId,
  }));

  const workflowId = makeConfluenceRemoveSpacesWorkflowId(connector.id);

  try {
    await client.workflow.signalWithStart(confluenceRemoveSpacesWorkflow, {
      args: [
        {
          connectorId: connector.id,
          spaceIds,
        },
      ],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      signal: spaceUpdatesSignal,
      signalArgs: [signalArgs],
      memo: {
        connectorId,
      },
    });
  } catch (err) {
    return new Err(err as Error);
  }

  return new Ok(workflowId);
}

export async function stopConfluenceSyncWorkflow(
  connectorId: ModelId
): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(
      `[Confluence] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const workflowId = makeConfluenceSyncWorkflowId(connectorId);

  try {
    const handle: WorkflowHandle<typeof confluenceSyncWorkflow> =
      client.workflow.getHandle(workflowId);
    try {
      await handle.terminate();
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
      }
    }
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      "Failed to stop Confluence workflow."
    );
    return new Err(e as Error);
  }
}

export async function launchConfluencePersonalDataReportingSchedule() {
  const client = await getTemporalClient();

  const action: ScheduleOptionsAction = {
    type: "startWorkflow",
    workflowType: confluencePersonalDataReportingWorkflow,
    args: [],
    taskQueue: QUEUE_NAME,
  };

  try {
    await client.schedule.create({
      action,
      scheduleId: makeConfluencePersonalDataWorkflowId(),
      policies: {
        // If Temporal Server is down or unavailable at the time when a Schedule should take an Action.
        // Backfill scheduled action up to 1 previous day.
        catchupWindow: "1 day",
        // Only one workflow at a time.
        overlap: ScheduleOverlapPolicy.SKIP,
      },
      spec: {
        // According to Atlassian's documentation, the cycle period is 7 days.
        intervals: [{ every: "7d" }],
      },
    });
  } catch (err) {
    // If the schedule is already running, ignore the error.
    if (!isScheduleAlreadyRunning(err)) {
      throw err;
    }
  }
}

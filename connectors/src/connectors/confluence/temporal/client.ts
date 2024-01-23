import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { ScheduleOptionsAction } from "@temporalio/client";
import { ScheduleOverlapPolicy } from "@temporalio/client";

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
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { Connector } from "@connectors/lib/models";
import { getTemporalClient } from "@connectors/lib/temporal";
import { isScheduleAlreadyRunning } from "@connectors/types/errors";

export async function launchConfluenceSyncWorkflow(
  connectorId: ModelId,
  spaceIds: string[] = [],
  forceUpsert = false
): Promise<Result<undefined, Error>> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }

  const client = await getTemporalClient();
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const signalArgs: SpaceUpdatesSignal[] = spaceIds.map((sId) => ({
    action: "added",
    spaceId: sId,
  }));

  // When the workflow is inactive, we omit passing spaceIds as they are only used to signal modifications within a currently active full sync workflow.
  try {
    await client.workflow.signalWithStart(confluenceSyncWorkflow, {
      args: [
        {
          connectorId: connector.id,
          dataSourceConfig,
          connectionId: connector.connectionId,
          forceUpsert,
        },
      ],
      taskQueue: QUEUE_NAME,
      workflowId: makeConfluenceSyncWorkflowId(connector.id),
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

  return new Ok(undefined);
}

export async function launchConfluenceRemoveSpacesSyncWorkflow(
  connectorId: ModelId,
  spaceIds: string[] = []
) {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }

  const client = await getTemporalClient();
  const signalArgs: SpaceUpdatesSignal[] = spaceIds.map((sId) => ({
    action: "removed",
    spaceId: sId,
  }));

  try {
    await client.workflow.signalWithStart(confluenceRemoveSpacesWorkflow, {
      args: [
        {
          connectorId: connector.id,
          spaceIds,
        },
      ],
      taskQueue: QUEUE_NAME,
      workflowId: makeConfluenceRemoveSpacesWorkflowId(connector.id),
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

  return new Ok(undefined);
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

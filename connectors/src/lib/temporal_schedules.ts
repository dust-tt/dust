import type { Result } from "@dust-tt/types";
import { Err, normalizeError, Ok } from "@dust-tt/types";
import type {
  Client,
  ScheduleHandle,
  ScheduleOptionsAction,
  ScheduleSpec,
} from "@temporalio/client";
import {
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
  WorkflowNotFoundError,
} from "@temporalio/client";
import type { Duration } from "@temporalio/common";

import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

/**
 * Terminates running workflows spawned by the given schedule.
 * Throw a `ScheduleNotFoundError` if the schedule does not exist.
 */
async function terminateWorkflowsForSchedule(
  scheduleHandle: ScheduleHandle,
  client: Client
) {
  const scheduleDescription = await scheduleHandle.describe();
  // Terminate all the recent actions of the schedule,
  // the running workflows are not available under scheduleDescription.info.runningActions.
  for (const action of scheduleDescription.info.recentActions) {
    try {
      const workflowHandle = client.workflow.getHandle(
        action.action.workflow.workflowId
      );
      await workflowHandle.terminate();
    } catch (error) {
      if (!(error instanceof WorkflowNotFoundError)) {
        logger.error({ error }, "Failed to terminate workflow.");
        throw error;
      }
    }
  }
}

/**
 * Creates a schedule for the given connector.
 */
export async function createSchedule({
  scheduleId,
  connector,
  action,
  policies = {
    overlap: ScheduleOverlapPolicy.BUFFER_ONE,
    catchupWindow: "1 day",
  },
  spec,
}: {
  scheduleId: string;
  connector: ConnectorResource;
  action: ScheduleOptionsAction;
  policies: {
    overlap?: ScheduleOverlapPolicy;
    catchupWindow?: Duration;
    pauseOnFailure?: boolean;
  };
  spec: ScheduleSpec;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClient();

  try {
    const scheduleHandle = await client.schedule.create({
      action,
      scheduleId,
      policies,
      spec,
    });

    // Trigger the schedule to start the workflow immediately.
    await scheduleHandle.trigger();
  } catch (error) {
    logger.error(
      {
        connectorId: connector.id,
        scheduleId,
        error,
      },
      "Failed to create and trigger schedule."
    );
    return new Err(normalizeError(error));
  }

  return new Ok(scheduleId);
}

/**
 * Deletes the schedule and terminates the running workflows.
 */
export async function deleteSchedule({
  scheduleId,
  connector,
}: {
  scheduleId: string;
  connector: ConnectorResource;
}): Promise<Result<void, Error>> {
  const client = await getTemporalClient();

  const scheduleHandle = client.schedule.getHandle(scheduleId);
  try {
    // Terminate the running workflows.
    await terminateWorkflowsForSchedule(scheduleHandle, client);

    // Delete the schedule.
    await scheduleHandle.delete();
  } catch (error) {
    if (!(error instanceof ScheduleNotFoundError)) {
      logger.error(
        {
          connectorId: connector.id,
          scheduleId,
          error,
        },
        "Failed to delete schedule and terminate workflow."
      );
      return new Err(normalizeError(error));
    }
  }

  return new Ok(undefined);
}

/**
 * Unpauses the schedule if paused and triggers the schedule to start the workflow immediately.
 */
export async function triggerSchedule({
  scheduleId,
  connector,
}: {
  scheduleId: string;
  connector: ConnectorResource;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClient();

  const scheduleHandle = client.schedule.getHandle(scheduleId);
  try {
    // Unpause the schedule if paused.
    const scheduleDescription = await scheduleHandle.describe();
    if (scheduleDescription.state.paused) {
      await scheduleHandle.unpause();
    }

    // Trigger the schedule to start the workflow immediately.
    await scheduleHandle.trigger();
  } catch (error) {
    if (!(error instanceof ScheduleNotFoundError)) {
      logger.error(
        {
          connectorId: connector.id,
          scheduleId,
          error,
        },
        "Failed to unpause and trigger schedule."
      );
      return new Err(normalizeError(error));
    }
  }

  return new Ok(scheduleId);
}

/**
 * Pauses the schedule if running and terminates the running workflows.
 */
export async function pauseSchedule({
  scheduleId,
  connector,
}: {
  scheduleId: string;
  connector: ConnectorResource;
}): Promise<Result<void, Error>> {
  const client = await getTemporalClient();

  const scheduleHandle = client.schedule.getHandle(scheduleId);
  try {
    // Pause the schedule if running.
    await scheduleHandle.pause();

    // Terminate the running workflows.
    await terminateWorkflowsForSchedule(scheduleHandle, client);
  } catch (error) {
    if (!(error instanceof ScheduleNotFoundError)) {
      logger.error(
        {
          connectorId: connector.id,
          scheduleId,
          error,
        },
        "Failed to stop schedule and terminate workflow."
      );
      return new Err(normalizeError(error));
    }
  }

  return new Ok(undefined);
}

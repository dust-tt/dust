import { config, REGION_TIMEZONES } from "@app/lib/api/regions/config";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  ScheduleAlreadyRunning,
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
  WorkflowExecutionAlreadyStartedError,
} from "@temporalio/client";

import {
  ARCHIVE_INACTIVE_AGENTS_SCHEDULE_ID,
  makeArchiveWorkspaceWorkflowId,
  QUEUE_NAME,
} from "./config";
import {
  archiveInactiveAgentsWorkflow,
  archiveWorkspaceInactiveAgentsWorkflow,
} from "./workflows";

export async function launchArchiveInactiveAgentsSchedule(): Promise<
  Result<undefined, Error>
> {
  const client = await getTemporalClientForFrontNamespace();
  const region = config.getCurrentRegion();
  const timezone = REGION_TIMEZONES[region];

  try {
    await client.schedule.create({
      action: {
        type: "startWorkflow",
        workflowType: archiveInactiveAgentsWorkflow,
        args: [],
        taskQueue: QUEUE_NAME,
      },
      scheduleId: ARCHIVE_INACTIVE_AGENTS_SCHEDULE_ID,
      policies: {
        overlap: ScheduleOverlapPolicy.SKIP,
      },
      spec: {
        calendars: [{ hour: 0, minute: 0 }],
        timezone,
      },
    });

    logger.info(
      {
        region,
        timezone,
        scheduleId: ARCHIVE_INACTIVE_AGENTS_SCHEDULE_ID,
      },
      "[AgentInactivity] Created nightly archival schedule."
    );
  } catch (err) {
    if (!(err instanceof ScheduleAlreadyRunning)) {
      logger.error(
        { err },
        "[AgentInactivity] Failed creating nightly archival schedule."
      );

      return new Err(normalizeError(err));
    }
  }

  return new Ok(undefined);
}

export async function stopArchiveInactiveAgentsSchedule(): Promise<
  Result<undefined, Error>
> {
  const client = await getTemporalClientForFrontNamespace();

  try {
    const handle = client.schedule.getHandle(
      ARCHIVE_INACTIVE_AGENTS_SCHEDULE_ID
    );
    await handle.delete();
  } catch (err) {
    if (err instanceof ScheduleNotFoundError) {
      logger.info(
        { scheduleId: ARCHIVE_INACTIVE_AGENTS_SCHEDULE_ID },
        "[AgentInactivity] Nightly archival schedule not found, skipping."
      );

      return new Ok(undefined);
    }

    logger.error(
      { err },
      "[AgentInactivity] Failed deleting nightly archival schedule."
    );

    return new Err(normalizeError(err));
  }

  return new Ok(undefined);
}

/** Fires the schedule now, down the same path the nightly tick takes. */
export async function triggerArchiveInactiveAgentsSchedule(): Promise<
  Result<undefined, Error>
> {
  const client = await getTemporalClientForFrontNamespace();

  try {
    const handle = client.schedule.getHandle(
      ARCHIVE_INACTIVE_AGENTS_SCHEDULE_ID
    );
    await handle.trigger(ScheduleOverlapPolicy.ALLOW_ALL);
  } catch (err) {
    logger.error(
      { err },
      "[AgentInactivity] Failed triggering nightly archival schedule."
    );

    return new Err(normalizeError(err));
  }

  return new Ok(undefined);
}

/** One workspace, skipping the enumeration. For local testing and one-off operator runs. */
export async function launchArchiveWorkspaceInactiveAgentsWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeArchiveWorkspaceWorkflowId(workspaceId);

  try {
    await client.workflow.start(archiveWorkspaceInactiveAgentsWorkflow, {
      args: [{ workspaceId, evaluatedAtMs: Date.now() }],
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: { workspaceId },
    });
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info(
        { workflowId, workspaceId },
        "[AgentInactivity] Sweep already running for this workspace; skipping."
      );

      return new Ok(workflowId);
    }

    logger.error(
      { err, workflowId, workspaceId },
      "[AgentInactivity] Failed starting workspace sweep."
    );

    return new Err(normalizeError(err));
  }

  return new Ok(workflowId);
}

import type { WorkflowHandle } from "@temporalio/client";
import moment from "moment-timezone";

import { config, REGION_TIMEZONES } from "@app/lib/api/regions/config";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Ok } from "@app/types";

import { QUEUE_NAME } from "./config";
import { runSignal } from "./signals";
import { dropPendingAgentsWorkflow } from "./workflows";

/**
 * Returns the UTC hour corresponding to midnight in the given timezone.
 */
function getMidnightUtcHour(timezone: string): number {
  const midnightInTz = moment.tz("00:00", "HH:mm", timezone);
  return midnightInTz.utc().hour();
}

export async function launchDropPendingAgentsWorkflow(): Promise<
  Result<undefined, Error>
> {
  const client = await getTemporalClientForFrontNamespace();
  const region = config.getCurrentRegion();
  const timezone = REGION_TIMEZONES[region];
  const utcHour = getMidnightUtcHour(timezone);

  await client.workflow.signalWithStart(dropPendingAgentsWorkflow, {
    args: [],
    taskQueue: QUEUE_NAME,
    workflowId: "drop-pending-agents-workflow",
    signal: runSignal,
    signalArgs: undefined,
    cronSchedule: `0 ${utcHour} * * *`, // Every day at midnight in the region's timezone.
  });

  logger.info(
    { region, timezone, utcHour },
    "[Drop Pending Agents] Launched workflow."
  );

  return new Ok(undefined);
}

export async function stopDropPendingAgentsWorkflow({
  stopReason,
}: {
  stopReason: string;
}) {
  const client = await getTemporalClientForFrontNamespace();

  try {
    const handle: WorkflowHandle<typeof dropPendingAgentsWorkflow> =
      client.workflow.getHandle("drop-pending-agents-workflow");
    await handle.terminate(stopReason);
  } catch (e) {
    logger.error(
      {
        error: e,
      },
      "[Drop Pending Agents] Failed stopping workflow."
    );
  }
}

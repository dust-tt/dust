import type { WorkflowHandle } from "@temporalio/client";
import moment from "moment-timezone";

import { config, REGION_TIMEZONES } from "@app/lib/api/regions/config";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

import { QUEUE_NAME } from "./config";
import { runSignal } from "./signals";
import { dataRetentionWorkflow } from "./workflows";

/**
 * Returns the UTC hour corresponding to midnight in the given timezone.
 */
function getMidnightUtcHour(timezone: string): number {
  const midnightInTz = moment.tz("00:00", "HH:mm", timezone);
  return midnightInTz.utc().hour();
}

export async function launchDataRetentionWorkflow(): Promise<
  Result<undefined, Error>
> {
  const client = await getTemporalClientForFrontNamespace();
  const region = config.getCurrentRegion();
  const timezone = REGION_TIMEZONES[region];
  const utcHour = getMidnightUtcHour(timezone);

  await client.workflow.signalWithStart(dataRetentionWorkflow, {
    args: [],
    taskQueue: QUEUE_NAME,
    workflowId: "data-retention-workflow",
    signal: runSignal,
    signalArgs: undefined,
    cronSchedule: `0 ${utcHour} * * 1-5`, // Every weekday at midnight in the region's timezone.
  });

  logger.info(
    { region, timezone, utcHour },
    "[Data Retention] Launched workflow."
  );

  return new Ok(undefined);
}

export async function stopDataRetentionWorkflow({
  stopReason,
}: {
  stopReason: string;
}) {
  const client = await getTemporalClientForFrontNamespace();

  try {
    const handle: WorkflowHandle<typeof dataRetentionWorkflow> =
      client.workflow.getHandle("data-retention-workflow");
    await handle.terminate(stopReason);
  } catch (e) {
    logger.error(
      {
        error: e,
      },
      "[Data Retention] Failed stopping workflow."
    );
  }
}

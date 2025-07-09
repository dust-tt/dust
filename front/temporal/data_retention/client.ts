import type { WorkflowHandle } from "@temporalio/client";

import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Ok } from "@app/types";

import { QUEUE_NAME } from "./config";
import { runSignal } from "./signals";
import { dataRetentionWorkflow } from "./workflows";

export async function launchDataRetentionWorkflow(): Promise<
  Result<undefined, Error>
> {
  const client = await getTemporalClient();
  await client.workflow.signalWithStart(dataRetentionWorkflow, {
    args: [],
    taskQueue: QUEUE_NAME,
    workflowId: "data-retention-workflow",
    signal: runSignal,
    signalArgs: undefined,
    cronSchedule: "0 14 * * 1-5", // Every weekday at 2pm.
  });

  return new Ok(undefined);
}

export async function stopDataRetentionWorkflow() {
  const client = await getTemporalClient();

  try {
    const handle: WorkflowHandle<typeof dataRetentionWorkflow> =
      client.workflow.getHandle("data-retention-workflow");
    await handle.terminate();
  } catch (e) {
    logger.error(
      {
        error: e,
      },
      "[Data Retention] Failed stopping workflow."
    );
  }
}

import type { Client } from "@temporalio/client";
import { ScheduleNotFoundError } from "@temporalio/client";

import { getTemporalClientForConnectorsNamespace } from "@app/lib/temporal";
import type { CheckFunction } from "@app/types";

async function isTemporalSchedulerRunning(client: Client, workflowId: string) {
  try {
    const scheduleHandle = client.schedule.getHandle(workflowId);

    // This throws and error if the schedule does not exist.
    const scheduleDescription = await scheduleHandle.describe();

    // If the schedule is paused, it will not run.
    return !scheduleDescription.state.paused;
  } catch (err) {
    if (err instanceof ScheduleNotFoundError) {
      return false;
    }

    throw err;
  }
}

export const checkWebcrawlerSchedulerActiveWorkflow: CheckFunction = async (
  _checkName,
  logger,
  reportSuccess,
  reportFailure
) => {
  const client = await getTemporalClientForConnectorsNamespace();

  logger.info("Checking if webcrawler scheduler exists and it not paused");
  const existsAndNotPaused = await isTemporalSchedulerRunning(
    client,
    "webcrawler-scheduler"
  );

  if (existsAndNotPaused) {
    reportSuccess({ actionLinks: [] });
  } else {
    reportFailure(
      { actionLinks: [] },
      "Webcrawler scheduler does not exist or is paused"
    );
  }
};

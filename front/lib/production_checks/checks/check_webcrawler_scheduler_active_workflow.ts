import type { Client } from "@temporalio/client";
import { ScheduleNotFoundError } from "@temporalio/client";

import type { CheckFunction } from "@app/lib/production_checks/types";
import { getTemporalConnectorsNamespaceConnection } from "@app/lib/temporal";

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
  const client = await getTemporalConnectorsNamespaceConnection();

  logger.info("Checking if webcrawler scheduler exists and it not paused");
  const existsAndNotPaused = await isTemporalSchedulerRunning(
    client,
    "webcrawler-scheduler"
  );

  if (existsAndNotPaused) {
    reportSuccess({});
  } else {
    reportFailure({}, "Webcrawler scheduler does not exist or is paused");
  }
};

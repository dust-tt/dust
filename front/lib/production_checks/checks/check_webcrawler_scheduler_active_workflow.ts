import type { Client, WorkflowHandle } from "@temporalio/client";

import type { CheckFunction } from "@app/lib/production_checks/types";
import { getTemporalConnectorsNamespaceConnection } from "@app/lib/temporal";

async function isTemporalWorkflowRunning(client: Client, workflowId: string) {
  try {
    const workflowHandle: WorkflowHandle =
      client.workflow.getHandle(workflowId);

    const descriptions = await Promise.all([workflowHandle.describe()]);

    return descriptions.every(({ status: { name } }) => name === "RUNNING");
  } catch (err) {
    return false;
  }
}

export const checkWebcrawlerSchedulerActiveWorkflow: CheckFunction = async (
  _checkName,
  logger,
  reportSuccess,
  reportFailure
) => {
  const client = await getTemporalConnectorsNamespaceConnection();

  logger.info("Checking if webcrawler scheduler is running");
  const isActive = await isTemporalWorkflowRunning(
    client,
    "webcrawler-scheduler"
  );

  if (!isActive) {
    reportFailure({}, `Missing webcrawler_scheduler temporal workflow.`);
  } else {
    reportSuccess({});
  }
};

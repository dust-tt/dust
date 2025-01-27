import type { Client, WorkflowHandle } from "@temporalio/client";

import type { CheckFunction } from "@app/lib/production_checks/types";
import { getTemporalClient } from "@app/lib/temporal";

const WORKFLOW_IDS = ["data-retention-workflow", "tracker-notify-workflow"];

async function isWorkflowRunning(client: Client, workflowId: string) {
  try {
    const workflowHandle: WorkflowHandle =
      client.workflow.getHandle(workflowId);
    const description = await workflowHandle.describe();
    return description.status.name === "RUNNING";
  } catch (err) {
    return false;
  }
}

export const checkActiveWorkflowsForFront: CheckFunction = async (
  _checkName,
  logger,
  reportSuccess,
  reportFailure,
  heartbeat
) => {
  const client = await getTemporalClient();

  const missingWorkflows: string[] = [];
  for (const workflowId of WORKFLOW_IDS) {
    heartbeat();
    const isRunning = await isWorkflowRunning(client, workflowId);
    if (!isRunning) {
      missingWorkflows.push(workflowId);
    }
  }

  if (missingWorkflows.length > 0) {
    reportFailure(
      { missingWorkflows },
      `Missing global front workflows: ${missingWorkflows.join(", ")}.`
    );
  } else {
    reportSuccess({});
  }
};

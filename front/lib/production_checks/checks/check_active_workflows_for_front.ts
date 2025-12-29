import type { Client, WorkflowHandle } from "@temporalio/client";

import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import type { ActionLink, CheckFunction } from "@app/types";

const WORKFLOW_IDS = ["data-retention-workflow", "tracker-notify-workflow"];

async function isWorkflowRunning(client: Client, workflowId: string) {
  try {
    const workflowHandle: WorkflowHandle =
      client.workflow.getHandle(workflowId);
    const description = await workflowHandle.describe();
    return description.status.name === "RUNNING";
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const client = await getTemporalClientForFrontNamespace();

  const missingWorkflows: string[] = [];
  for (const workflowId of WORKFLOW_IDS) {
    heartbeat();
    const isRunning = await isWorkflowRunning(client, workflowId);
    if (!isRunning) {
      missingWorkflows.push(workflowId);
    }
  }

  if (missingWorkflows.length > 0) {
    const actionLinks: ActionLink[] = missingWorkflows.map((workflowId) => ({
      label: `Missing workflow: ${workflowId}`,
      url: "#",
    }));
    reportFailure(
      { missingWorkflows, actionLinks },
      `Missing global front workflows: ${missingWorkflows.join(", ")}.`
    );
  } else {
    reportSuccess();
  }
};

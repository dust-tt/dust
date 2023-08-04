import { WorkflowExecutionStatusName } from "@temporalio/client";

import { getTemporalClient } from "@app/lib/temporal";

import { scrubDataSourceWorkflow } from "./workflows";

export async function launchScrubDataSourceWorkflow({
  wId,
  dustAPIProjectId,
}: {
  wId: string;
  dustAPIProjectId: string;
}) {
  const client = await getTemporalClient();

  await client.workflow.start(scrubDataSourceWorkflow, {
    args: [
      {
        dustAPIProjectId,
      },
    ],
    taskQueue: "poke-queue",
    workflowId: `poke-${wId}-scrub-data-source-${dustAPIProjectId}`,
  });
}

export type PokeWorkflowExectution = {
  type: string;
  workflowId: string;
  status: WorkflowExecutionStatusName;
  startTime?: Date;
  closeTime?: Date;
};

export async function listPokeWorkflowsForWorkspace({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<PokeWorkflowExectution[]> {
  const client = await getTemporalClient();

  const list = await client.workflow.list({
    query: `WorkflowId BETWEEN "poke-${workspaceId}-" AND "poke-${workspaceId}-zzzzzzzzzzz"`,
  });

  const executions = [];

  for await (const x of list) {
    executions.push({
      type: x.type,
      workflowId: x.workflowId,
      status: x.status.name,
      startTime: x.startTime,
      closeTime: x.closeTime,
    });
  }

  // sort by start time (desc)
  // if no start time, add to the end
  return executions.sort((a, b) => {
    if (!a.startTime && !b.startTime) {
      return 0;
    }
    if (!a.startTime) {
      return 1;
    }
    if (!b.startTime) {
      return -1;
    }
    return b.startTime.getTime() - a.startTime.getTime();
  });
}

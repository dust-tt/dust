import { getTemporalClient } from "@app/lib/temporal";

import { deleteWorkspaceWorkflow, scrubDataSourceWorkflow } from "./workflows";

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

export async function launchDeleteWorkspaceWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const client = await getTemporalClient();

  await client.workflow.start(deleteWorkspaceWorkflow, {
    args: [
      {
        workspaceId,
      },
    ],
    taskQueue: "poke-queue",
    workflowId: `poke-${workspaceId}-delete-workspace`,
  });
}

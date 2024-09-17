import { Err } from "@dust-tt/types";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";

import { deleteWorkspaceWorkflow, scrubDataSourceWorkflow } from "./workflows";

export async function launchScrubDataSourceWorkflow({
  wId,
  dustAPIProjectId,
}: {
  wId: string;
  dustAPIProjectId: string;
}) {
  const client = await getTemporalClient();
  try {
    await client.workflow.start(scrubDataSourceWorkflow, {
      args: [
        {
          dustAPIProjectId,
        },
      ],
      taskQueue: "poke-queue",
      workflowId: `poke-${wId}-scrub-data-source-${dustAPIProjectId}`,
    });
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger.error(
        {
          wId,
          error: e,
        },
        "Failed starting scrub data source workflow."
      );
    }
    return new Err(e as Error);
  }
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

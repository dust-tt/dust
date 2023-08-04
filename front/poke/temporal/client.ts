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

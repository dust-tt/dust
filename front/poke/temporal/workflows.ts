import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/poke/temporal/activities";

const { scrubDataSourceActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minute",
});

export async function scrubDataSourceWorkflow({
  dustAPIProjectId,
}: {
  dustAPIProjectId: string;
}) {
  await scrubDataSourceActivity({ dustAPIProjectId });
}
